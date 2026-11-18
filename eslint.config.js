// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  // Runs Prettier as a lint rule and turns off stylistic rules that conflict with it. Keep last among shared configs.
  eslintPluginPrettierRecommended,
  {
    ignores: ['dist/*', 'coverage/*', '.expo/*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  // Architecture boundaries (see docs/ARCHITECTURE.md). Later blocks override earlier ones for the same files.
  {
    // Only the HTTP layer (and its test helpers) knows axios exists; everything else uses HttpClient.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/core/http/**', 'src/testing/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'axios', message: 'Use HttpClient / HttpClientFactory from @/core/http instead.' }] },
      ],
    },
  },
  {
    // Domain = entities, repository interfaces, use cases: pure TypeScript, no frameworks, no outer layers.
    files: ['src/features/*/domain/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'react-native', 'react-native-*', '@react-native*', 'expo', 'expo-*'],
              message: 'Domain code must not depend on UI or platform frameworks.',
            },
            {
              group: ['@reduxjs/*', 'axios', 'zod'],
              message: 'Domain code must not depend on state, HTTP or validation libraries.',
            },
            {
              group: ['**/data/**', '**/presentation/**', '../data', '../presentation', '**/di'],
              message: 'Domain is the inner layer: data and presentation depend on it, never the reverse.',
            },
          ],
        },
      ],
    },
  },
]);
