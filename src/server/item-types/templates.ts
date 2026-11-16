// Starter templates (DESIGN §4.4), seeded once on a fresh instance (see seed.ts).
// Quantity, unit, min quantity, serial-free receipts etc. are real item columns
// or attachments (§4.1, §6), so they are not repeated as attributes here.
import type { FieldDefinition } from "../../lib/item-types/fields";
import type { TypeIcon } from "../../lib/item-types/icons";
import type { TrackingMode } from "../../lib/item-types/type-input";

export type StarterTemplate = {
  key: string;
  name: string;
  icon: TypeIcon;
  tracking: TrackingMode;
  parentKey?: string;
  fields: FieldDefinition[];
};

const brand: FieldDefinition = { key: "brand", label: "Marke", kind: "text" };
const model: FieldDefinition = { key: "model", label: "Modell", kind: "text" };
const serial: FieldDefinition = { key: "serial", label: "Seriennummer", kind: "text" };

/** Parents come before their children. */
export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: "book",
    name: "Buch",
    icon: "book",
    tracking: "individual",
    fields: [
      { key: "authors", label: "Autor(en)", kind: "text", multiple: true, required: true },
      { key: "isbn", label: "ISBN", kind: "isbn", lookup: ["dnb", "openlibrary"] },
      { key: "publisher", label: "Verlag", kind: "text" },
      { key: "year", label: "Jahr", kind: "integer", min: 1450, max: 2100 },
      {
        key: "format",
        label: "Format",
        kind: "select",
        options: ["Gebunden", "Taschenbuch", "E-Book", "Hörbuch"],
      },
      { key: "series", label: "Reihe", kind: "text" },
      { key: "language", label: "Sprache", kind: "text" },
      { key: "read_by", label: "Gelesen von", kind: "user", multiple: true },
    ],
  },
  {
    key: "tool",
    name: "Werkzeug",
    icon: "tool",
    tracking: "individual",
    fields: [brand, model, serial],
  },
  {
    key: "power_tool",
    name: "Elektrowerkzeug",
    icon: "power_tool",
    tracking: "individual",
    parentKey: "tool",
    fields: [
      {
        key: "power_source",
        label: "Energiequelle",
        kind: "select",
        options: ["Akku", "Netzstrom", "Benzin", "Druckluft"],
      },
      {
        key: "battery_system",
        label: "Akkusystem",
        kind: "text",
        help: "z. B. „Bosch 18V“ oder „Makita 18V LXT“",
      },
      { key: "voltage", label: "Spannung", kind: "measure", units: ["V"] },
    ],
  },
  {
    key: "spare_part",
    name: "Ersatzteil",
    icon: "screw",
    tracking: "stock",
    fields: [
      { key: "manufacturer", label: "Hersteller", kind: "text" },
      { key: "part_number", label: "Teilenummer", kind: "text" },
      { key: "fits", label: "Passt zu", kind: "item", multiple: true },
      { key: "dimensions", label: "Maße", kind: "text", help: "z. B. 30 × 12 mm" },
    ],
  },
  {
    key: "consumable",
    name: "Verbrauchsmaterial",
    icon: "bottle",
    tracking: "stock",
    fields: [
      brand,
      { key: "preferred_shop", label: "Bevorzugter Laden", kind: "text" },
      { key: "shop_url", label: "Link zum Shop", kind: "url" },
    ],
  },
  {
    key: "clothing",
    name: "Kleidung",
    icon: "shirt",
    tracking: "individual",
    fields: [
      {
        key: "category",
        label: "Kategorie",
        kind: "select",
        options: [
          "Oberteil",
          "Hose",
          "Kleid / Rock",
          "Jacke",
          "Schuhe",
          "Unterwäsche",
          "Accessoire",
        ],
      },
      {
        key: "size",
        label: "Größe",
        kind: "size",
        systems: ["child", "clothing_num", "clothing_letter", "shoe_eu"],
      },
      { key: "color", label: "Farbe", kind: "color" },
      {
        key: "season",
        label: "Saison",
        kind: "multiselect",
        options: ["Frühling", "Sommer", "Herbst", "Winter"],
      },
      { key: "fits", label: "Passt", kind: "user", multiple: true },
    ],
  },
  {
    key: "electronics",
    name: "Elektronik",
    icon: "laptop",
    tracking: "individual",
    fields: [
      brand,
      model,
      serial,
      {
        key: "warranty_until",
        label: "Garantie bis",
        kind: "date",
        help: "Erinnerung kurz vor Ablauf",
      },
    ],
  },
];
