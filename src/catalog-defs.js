// The part types of the catalog of real parts and what is derived for each: its contact map, where its pins stand and
// the definition the editor places a part from. The tables and the derivation are in Rust
// (rust/stm-core/src/catalog.rs, feature 62); this file is the JavaScript side.
import {rustPure,rustFn} from './rust-core.js';
import {CATALOG_TABLES} from './catalog-tables.js';
import {PART_DATASHEETS} from './part-datasheets.js';
// The datasheet name of a catalog part (the catalog's own name when no datasheet was found).
export const catalogName=v=>PART_DATASHEETS[v.id]?.name??v.name;
export const catalogType=id=>'ref_'+id.replaceAll('-','_');
/** LEGACY_PHYSICAL: catalog id of the real part each basic (simplified) part type is drawn as.
 *  CONTACT_MAPS: simulator-model contacts mapped to the physical variant's contact numbers.
 *  ON_CONTACT_PINS: modules standing on their own contacts (screw terminals, connectors, header holes in the photo).
 *  WIRED_CONTACTS: contacts that cannot go into a breadboard and are wired directly.
 *  CATALOG_SCOPE: the scope notes that appear beside an example and its device-specific Docs. */
export const {LEGACY_PHYSICAL,CATALOG_BY_TYPE,CONTACT_MAPS,ON_CONTACT_PINS,WIRED_CONTACTS,CATALOG_TWO_PIN,CATALOG_DEFS,CATALOG_SCOPE}=CATALOG_TABLES;
/** `{p1: 'p3', …}` or `{a: 'p1', …}` for a part type with a contact map, else null (the same frozen answer each time). */
export const catalogMap=rustPure('catalog_map');
/** True when pin `index` (0-based) of a catalog part is wired directly instead of plugged into the breadboard. */
export const isWiredContact=(id,index)=>{const w=WIRED_CONTACTS[id];return w==='all'||!!w?.includes(index);};
/** The drawing size of a catalog part's package and where its pins stand. */
export const catalogGeometry=v=>rustFn('catalog_geometry',v);
