// Landing page for the links in GymBuddy's emails. On Android it offers a button that hands the
// link (its ?code=... part) to the app; anywhere else it just says the job is done.
(function () {
  var APP = "app.gymbuddyapp.gymbuddy://auth-callback/";
  var isAndroid = /Android/i.test(navigator.userAgent);
  var button = document.getElementById("openApp");
  if (isAndroid) {
    if (button) button.setAttribute("href", APP + (location.search || "") + (location.hash || ""));
    document.getElementById("phone").hidden = false;
  } else {
    document.getElementById("computer").hidden = false;
  }
})();
