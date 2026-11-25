import { test } from "node:test";
import assert from "node:assert/strict";
import { countOf, homeAreas, homeRows, homesLabel, landTypes } from "../src/utils/homeRows.js";
import { isShortStaySearch, shortStayPath } from "../src/utils/shortStay.js";

const homes = (...ids) => ids.map((id) => ({ id }));
const ids = (row) => row.items.map((item) => item.id);

test("without featured homes the first row is the latest, and rows show new homes first", () => {
  const { lead, rows } = homeRows({ rows: { latest: homes(1, 2, 3, 4, 5), sale: homes(1, 3, 6, 7, 8), rent: homes(2, 9), stays: homes(4) } });
  assert.equal(lead.id, "latest");
  assert.deepEqual(ids(lead), [1, 2, 3, 4]);
  assert.deepEqual(rows.map((row) => row.id), ["sale", "rent"], "one home already shown isn't a row");
  assert.deepEqual(ids(rows[0]), [6, 7, 8, 1], "homes not seen yet, then repeats to fill the row");
  assert.deepEqual(ids(rows[1]), [9, 2]);
  const first = homes(1, 2, 3, 4);
  assert.deepEqual(homeRows({ rows: { latest: first, stays: [first[0], first[2]] } }).rows.map(ids), [[1, 3]], "a category keeps its row even when its homes are also the latest");
  assert.deepEqual(homeRows({ rows: { latest: first, sale: first } }).rows, [], "never the same row twice");
});

test("featured homes lead only when homes are really featured", () => {
  assert.equal(homeRows({ rows: { featured: homes(1), latest: homes(1, 2) } }).lead.id, "latest");
  const { lead, rows } = homeRows({ rows: { featured: homes(1, 2), latest: homes(3, 4, 1), sale: homes(1, 5) } });
  assert.deepEqual([lead.id, ids(lead)], ["featured", [1, 2]]);
  assert.deepEqual(rows.map((row) => [row.id, ids(row)]), [["sale", [5, 1]], ["latest", [3, 4, 1]]]);
  assert.deepEqual(homeRows({ rows: { featured: homes(1, 2), latest: homes(3, 1) } }).rows, [], "one new home isn't a row");
});

test("an empty site shows no rows", () => {
  assert.deepEqual(homeRows({ rows: {} }), { lead: { id: "latest", items: [] }, rows: [] });
  assert.deepEqual(homeRows(undefined).rows, []);
});

test("categories and areas come from what is listed", () => {
  const types = [{ value: "Apartment", count: 3 }, { value: "Land", count: 2 }, { value: "plot-of-land", count: 1 }];
  assert.deepEqual(landTypes(types).map((type) => type.value), ["Land", "plot-of-land"]);
  assert.equal(countOf(types, /^apartment$/i), 3);
  assert.deepEqual(homeAreas({ areas: [{ name: "Osu", image: "a" }, { name: "Tema" }, { name: "Aburi", image: "b" }] }, 5).map((area) => area.name), ["Osu", "Aburi"]);
  assert.deepEqual([homesLabel(1), homesLabel(1200)], ["1 home", "1,200 homes"]);
});

test("where 'Short stays' leads", () => {
  assert.equal(shortStayPath("/listings"), "/listings?stay=1");
  assert.equal(isShortStaySearch(new URLSearchParams("stay=1")), true);
  assert.equal(isShortStaySearch(new URLSearchParams("stay=0")), false);
});
