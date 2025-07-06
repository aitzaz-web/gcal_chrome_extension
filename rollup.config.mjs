import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'popup.js', // Entry point for your extension's popup
  output: {
    file: 'dist/popup.bundle.js',
    format: 'iife',
    name: 'PopupBundle',
    inlineDynamicImports: true
  },
  plugins: [
    resolve(),
    commonjs()
  ]
}; 