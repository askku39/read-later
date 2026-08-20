const browserGlobals = {
  URL: "readonly",
  URLSearchParams: "readonly",
  Request: "readonly",
  Response: "readonly",
  TextDecoder: "readonly",
  TextEncoder: "readonly",
  atob: "readonly",
  btoa: "readonly",
  caches: "readonly",
  console: "readonly",
  crypto: "readonly",
  fetch: "readonly",
  Headers: "readonly",
};

export default [
  {
    ignores: ["node_modules/**", ".wrangler/**"],
  },
  {
    files: ["src/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals,
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "none" }],
    },
  },
];
