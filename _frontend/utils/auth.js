import { decode } from "js-base64";
import { configFns } from "./config-fns";
import { del, get, put } from "./localstorage";

export default {
  set(auth) {
    console.log("Setting auth:", auth);
    put("auth", auth);
  },

  get() {
    const authData = get("auth");
    console.log("Getting auth:", authData);
    return authData;
  },

  clear() {
    console.log("Clearing auth");
    del("auth");
  },

  async oktokit() {
    const Octokit = (await import("octokit")).Octokit;
    const token = this.get()?.access_token;
    console.log("Creating Octokit with token:", token ? "exists" : "missing");

    return new Octokit({
      auth: token,
    });
  },

  async request(...args) {
    try {
      console.log("Making request:", args[0]);
      return await (await this.oktokit()).request(...args);
    } catch (error) {
      console.error("Request error:", error);
      if (error.status === 401) {
        console.log("Unauthorized, clearing auth");
        this.clear();
        location.reload();

        // handle Octokit error
        // see https://github.com/octokit/request-error.js
      } else {
        // handle all other errors
        throw error;
      }
    }
  },

  check() {
    const isAuthenticated = Boolean(this.get());
    console.log("Auth check:", isAuthenticated);
    return isAuthenticated;
  },

  async user() {
    return (await this.request("GET /user")).data;
  },

  async username() {
    return (await this.user()).login;
  },

  async fetchContents(owner, repo, path) {
    return (
      await this.request(`GET /repos/{owner}/{repo}/contents/${path}`, {
        owner,
        repo,
      })
    ).data;
  },

  async putContents(owner, repo, path, message, content, sha = undefined) {
    return (
      await this.request(`PUT /repos/{owner}/{repo}/contents/${path}`, {
        owner,
        repo,
        message,
        sha,
        content,
      })
    ).data;
  },

  async deleteContents(owner, repo, path, message, sha) {
    return (
      await this.request(`DELETE /repos/{owner}/{repo}/contents/${path}`, {
        owner,
        repo,
        message,
        sha,
      })
    ).data;
  },

  async checkRuns(owner, repo) {
    return (
      await this.request("GET /repos/{owner}/{repo}/commits/main/check-runs", {
        owner,
        repo,
      })
    ).data;
  },

  async config(owner, repo) {
    let content = "";

    try {
      content = decode(
        (await this.fetchContents(owner, repo, ".reproserc.yaml")).content,
      );
    } catch (error) {}

    return configFns(content);
  },
};
