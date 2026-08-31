import { defineConfig } from "eslint/config";
import pluginReact from "eslint-plugin-react";
import globals from "globals";

import baseConfig from "./base.config";

export default defineConfig([
  baseConfig,
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  pluginReact.configs.flat.recommended,
  {
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      react: { version: "19" },
    },
    rules: {
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
]);
