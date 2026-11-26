// The catalog of real parts as the Rust side holds it (rust/stm-core/src/catalog.rs and its data files; feature 62):
// read once, frozen, and shared by the modules that export its tables under their old names.
import {rustTable} from './rust-core.js';
export const CATALOG_TABLES=rustTable('catalog_tables');
