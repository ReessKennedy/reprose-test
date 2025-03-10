import auth from "../../utils/auth";

window.home = () => ({
  init() {
    console.log("Home init, auth check:", auth.check());
    console.log("Auth data:", auth.get());
    
    if (auth.check()) {
      console.log("Redirecting to /finder");
      location.href = "/finder";
    }
  },

  login() {
    console.log("Login clicked, redirecting to /auth");
    location.href = "/auth";
  },

  logout() {
    console.log("Logout clicked, clearing auth");
    auth.clear();
    location.reload();
  },
});
