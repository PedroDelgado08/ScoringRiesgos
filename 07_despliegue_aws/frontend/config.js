// =====================================================================
// config.js · Website configuration
// ---------------------------------------------------------------------
// Kept separate from app.js so that switching APIs does not require
// touching the logic. window.APP_CONFIG is a GLOBAL variable read by app.js.
//
// WHICH API IS USED?
//   · Page opened on your PC (double click = file://, or localhost)
//       → Local API with uvicorn: its CORS accepts any origin ("*")
//   · Page served from CloudFront
//       → AWS API: its CORS only accepts the website's domains
// =====================================================================
const API_LOCAL = "http://127.0.0.1:8000";
const API_AWS = "https://8ge1a1ntk1.execute-api.eu-central-1.amazonaws.com"; // "ApiUrl" output of sam deploy

// location = the address of the page being viewed
const ES_LOCAL =
  location.protocol === "file:" ||
  ["localhost", "127.0.0.1"].includes(location.hostname);

window.APP_CONFIG = {
  API_URL: ES_LOCAL ? API_LOCAL : API_AWS,
};