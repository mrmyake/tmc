import { readFileSync } from "node:fs";
import { google } from "googleapis";

const TOKEN_PATH = process.env.GSC_TOKEN_PATH;
const CLIENT_PATH = process.env.GSC_OAUTH_CLIENT_PATH;
const raw = JSON.parse(readFileSync(CLIENT_PATH, "utf8"));
const cfg = raw.installed || raw.web;
const oauth2 = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, "http://127.0.0.1:8765");
oauth2.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, "utf8")));
const sc = google.searchconsole({ version: "v1", auth: oauth2 });
const res = await sc.sites.list();
console.log(JSON.stringify(res.data.siteEntry ?? [], null, 2));
