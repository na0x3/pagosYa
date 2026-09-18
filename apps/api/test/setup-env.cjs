const fs = require("node:fs");
const path = require("node:path");

const state = JSON.parse(fs.readFileSync(path.join(__dirname, ".e2e-state.json"), "utf8"));

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: state.databaseUrl,
  UPLOADS_DIR: state.uploadsDir,
  REDIS_URL: "",
  OPENAI_API_KEY: "",
  BANECO_QR_ENABLED: "false",
  SIAT_ENABLED: "false",
  INTERNAL_RAIL_CALLBACK_SECRET: "e2e-internal-rail-secret",
  INTERNAL_OPS_SECRET: "e2e-internal-ops-secret",
  ORDER_TRACKING_SECRET: "e2e-order-tracking-secret",
});
