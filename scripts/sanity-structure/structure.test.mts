import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkRepo,
  missingTypes,
  structureTypeNames,
} from "../check-sanity-structure.mjs";

test("structure van de repo verwijst alleen naar geregistreerde types", () => {
  assert.deepEqual(checkRepo(), []);
});

test("extraheert documentTypeListItem, schemaType en documentTypeList", () => {
  const src = `S.documentTypeListItem("a").title("A");
    S.document().schemaType('b').documentId("b");
    S.documentTypeList("c")`;
  assert.deepEqual(structureTypeNames(src), ["a", "b", "c"]);
});

test("meldt een niet geregistreerd type", () => {
  const index = `import a from "./a";\nexport const schemaTypes = [a];`;
  const read = () => `export default { name: "a" }`;
  const cfg = `S.documentTypeListItem("a"); S.documentTypeListItem("ghost")`;
  assert.deepEqual(missingTypes(cfg, index, read), ["ghost"]);
});
