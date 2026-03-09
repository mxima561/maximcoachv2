// eslint.config.js
const next = require("eslint-plugin-next");

module.exports = [
  {
    files: ["**/*.js", "**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
      },
    },
    plugins: {
      next,
    },
    rules: {
      ...next.configs.recommended.rules,
      "next/no-html-link-for-pages": "off",
    },
  },
];