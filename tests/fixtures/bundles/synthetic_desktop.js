// Synthetic Claude.app desktop-bundle fragment for extractor self-tests.
// Mimics the shape of `.vite/build/index.js` symbols: MGn (kernel env allowlist),
// vKA (kernel env filter fn), ljt (secret-unset list).

var MGn = new Set(["HOME","USER","LOGNAME","TERM","LANG","LC_ALL","TZ","PATH",
"CONDA_PREFIX","VIRTUAL_ENV","R_LIBS_USER","R_HOME","PYTHONUNBUFFERED",
"SANDBOX_RUNTIME","TMPDIR","COO_CPUS","PIP_INDEX_URL","UV_INDEX_URL",
"npm_config_registry","HTTP_PROXY","HTTPS_PROXY","http_proxy","https_proxy",
"NO_PROXY","no_proxy","FTP_PROXY","ftp_proxy","OPERON_SECRET_VARS"]);

function vKA(t){let r={};for(let k of Object.keys(t))if(MGn.has(k))r[k]=t[k];
delete t.HOME, delete t.USER, delete t.LOGNAME, delete t.TMPDIR; return r;}

var ljt = ["ANTHROPIC_API_KEY","ANTHROPIC_API_KEY_ENCRYPTION_KEY",
"AWS_SECRET_ACCESS_KEY","AWS_SESSION_TOKEN","CLAUDE_OAUTH_CLIENT_SECRET",
"CORE_API_KEY","DATABASE_URL","ELSEVIER_API_KEY","FDA_API_KEY",
"GCS_CONFIG_BUCKET","GEMINI_API_KEY","GOOGLE_APPLICATION_CREDENTIALS",
"NCBI_API_KEY","OAUTH_CALLBACK_URL","OAUTH_ENCRYPTION_KEY","OPENAI_API_KEY",
"OPENROUTER_API_KEY","OPERON_AMPLITUDE_API_KEY_DEV",
"OPERON_AMPLITUDE_API_KEY_PROD","OPERON_CONTACT_EMAIL",
"OPERON_EZPROXY_COOKIE","OPERON_EZPROXY_URL","REDIS_URL",
"SEMANTIC_SCHOLAR_API_KEY","SPRINGER_API_KEY"];
