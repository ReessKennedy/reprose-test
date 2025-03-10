import auth from "../../utils/auth";
import { decode, encode } from "js-base64";
import fm from "front-matter";
import { stringify } from "yaml";
import { init as initCommandHandler } from "../../utils/commands-handler";
import protocol from "../../protocol";
import { getKvData } from "../../utils/form-kvdata";
import { cleanupPath } from "../../utils/cleanup-path";
import { Alpine } from "alpinejs";

window.editor = () => {
  return {
    editor: null,
    owner: null,
    path: null,
    sha: null,
    saving: false,
    loading: true,
    changed: false,
    filename: "",
    attributes: {},
    body: "",
    config: {},
    status: null,
    statusUrl: null,

    async init() {
      const EasyMDE = (await import("easymde")).default;

      this.owner = await auth.username();

      this.path = this.getPathFromLocation();

      this.config = await auth.config(this.owner, this.getRepo());

      this.filename =
        this.getFilenameFromPath() ??
        `${new Date().toISOString().split("T")[0]}.md`;

      if (this.path) {
        await this.load();
      }

      this.editor = new EasyMDE({
        element: this.$refs.input,
        spellChecker: false,
        initialValue: Alpine.raw(this.body),
        placeholder: "Start writing…",
      });

      this.editor.codemirror.on("change", () => {
        this.body = this.editor.value();
        this.changed = true;
      });

      initCommandHandler({
        protocol,
        commands: {
          browse: () => {
            parent.postMessage(
              `modal:open?${new URLSearchParams({ url: "/finder" })}`,
              "*",
            );
          },

          open: (params) => {
            location.href = `/editor?${new URLSearchParams({
              path: params.get("path"),
            })}`;
          },

          delete: () => {
            this.delete();
          },

          save: () => {
            parent.postMessage(
              `modal:open?${new URLSearchParams({
                url: `/commit?${new URLSearchParams({
                  message: `${this.isExists() ? "Update" : "Create"} \`${this.filename}\` via Reprose`,
                  useDeleteOld:
                    this.isExists() &&
                    this.getFilenameFromPath() !== Alpine.raw(this.filename)
                      ? "1"
                      : "0",
                })}`,
                height: 380,
              })}`,
              "*",
            );
          },

          commit: (params) => {
            this.commit(params.get("message"), params.get("deleteOld") === "1");
          },
        },
      });

      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'frontmatter-update') {
          this.filename = event.data.filename;
          this.attributes = {};
          
          event.data.fields.forEach(field => {
            this.attributes[field.name] = field.value;
          });
          
          this.changed = true;
        }
      });
    },

    handleChange() {
      this.changed = true;
    },

    handlePageUnload(event) {
      if (this.changed) {
        event.preventDefault();

        return "You want to close a page that has unsaved changes. Are you sure?";
      }
    },

    destroy() {
      this.editor.toTextArea();
    },

    async delete() {
      if (!this.isExists()) {
        alert(`Can't delete file because it doesn't exists`);
        return;
      }

      if (
        confirm(
          `You are about to delete ${this.getFilenameFromPath()}. Are you sure?`,
        )
      ) {
        this.loading = true;

        await auth.deleteContents(
          this.owner,
          this.getRepo(),
          this.getPath(true),
          `Delete \`${this.getFilenameFromPath()}\` via Reprose`,
          this.sha,
        );

        this.loading = false;

        location.href = "/finder";
      }
    },

    getPathFromLocation() {
      return new URL(location.href).searchParams.get("path");
    },

    getRepo() {
      const _path = this.path.split("/");
      return _path[0] ?? null;
    },

    getPath(withoutRepo = false, withoutFile = false) {
      let _path = this.path
        .split("/")
        .filter((segment) => segment.trim() !== "");

      if (withoutRepo) {
        _path = _path.slice(1);
      }

      if (withoutFile) {
        _path = _path.slice(0, -1);
      }

      return cleanupPath(_path.join("/"));
    },

    getFilenameFromPath() {
      if (!this.isPathWithFile()) {
        return null;
      }

      const _path = this.path.split("/");
      return _path.slice(_path.length - 1, _path.length)[0];
    },

    isPathWithFile() {
      return !this.path.endsWith("/");
    },

    isExists() {
      return this.sha !== null;
    },

    updateAttributes() {
      const attributes = this.config.formatAttributes(
        getKvData(this.$root, "attributes"),
      );

      this.attributes = attributes;

      this.updateAutosize();
    },

    updateAutosize() {
      requestAnimationFrame(() => {
        Array.from(this.$root.querySelectorAll("[x-autosize]")).forEach(
          (element) => {
            element.dispatchEvent(new CustomEvent("autosize"));
          },
        );
      });
    },

    fields() {
      return this.config.getAttributesFields(Alpine.raw(this.attributes));
    },

    addAttribute() {
      this.attributes = {
        ...this.attributes,
        "": "",
      };
    },

    async load() {
      this.loading = true;

      if (this.isPathWithFile()) {
        try {
          const { content, sha } = await auth.fetchContents(
            this.owner,
            this.getRepo(),
            this.getPath(true),
          );

          const { attributes, body } = fm(decode(content));

          this.attributes = this.config.formatAttributes(attributes);
          this.body = body;
          this.sha = sha;
        } catch (error) {
          location.href = "/finder";
        }
      } else {
        this.attributes = this.config.getDefaultAttributes();
      }

      this.loading = false;
    },

    async commit(message, deleteOld) {
      this.saving = true;

      const attributes = this.config.formatAttributes(
        Alpine.raw(this.attributes),
        true,
        true,
      );

      const body = Alpine.raw(this.body);

      const content = [
        Object.entries(attributes).length > 0
          ? `---\n${stringify(attributes).trim()}\n---`
          : null,
        body.length > 0 ? `${body.trim()}` : null,
      ]
        .filter((item) => item !== null)
        .join("\n");

      const path = cleanupPath(
        [this.getPath(true, this.isPathWithFile()), this.filename].join("/"),
      );

      const {
        content: { sha, name, path: _path },
      } = await auth.putContents(
        this.owner,
        this.getRepo(),
        path,
        message,
        encode(content),
        this.sha ?? undefined,
      );

      if (deleteOld) {
        await auth.deleteContents(
          this.owner,
          this.getRepo(),
          this.getPath(true),
          `[skip ci] Delete \`${this.getFilenameFromPath()}\` because name of file was changed to \`${this.filename}\` via Reprose`,
          this.sha,
        );

        requestAnimationFrame(() => {
          location.href = `/editor?${new URLSearchParams({
            path: cleanupPath([this.getRepo(), _path].join("/")),
          })}`;
        });
      }

      this.sha = sha;
      this.filename = name;
      this.path = cleanupPath([this.getRepo(), _path].join("/"));

      this.saving = false;
      this.changed = false;

      this.checkStatus();
    },

    checkStatus() {
      const timer = setInterval(async () => {
        const { check_runs } = await auth.checkRuns(this.owner, this.getRepo());

        const { status, conclusion, html_url } = check_runs?.[0] ?? {};

        this.status = status === "completed" ? conclusion : status;
        this.statusUrl = html_url;

        if (status === "completed") {
          clearInterval(timer);
        }
      }, 5000);
    },

    clearStatus() {
      this.status = null;
    },

    statusHtml() {
      if (this.status === "in_progress") {
        return `${icons.spinnerCircle} <span>In progress</span`;
      } else if (this.status == "failure") {
        return `${icons.circleX} <span>Failure</span>`;
      } else if (this.status == "success") {
        return `${icons.circleCheck} <span>Success</span>`;
      }

      return "";
    },

    openFrontmatterModal() {
      const data = {
        type: 'frontmatter-data',
        filename: this.filename,
        fields: this.fields()
      };

      parent.postMessage(
        `modal:open?${new URLSearchParams({
          url: "/frontmatter",
          height: 600
        })}`,
        "*"
      );

      // Wait a bit for the modal to open before sending the data
      setTimeout(() => {
        window.frames[0].postMessage(data, '*');
      }, 100);
    },
  };
};
