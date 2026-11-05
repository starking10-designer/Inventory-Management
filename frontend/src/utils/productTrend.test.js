import test from "node:test";
import assert from "node:assert/strict";
import { productTrendRange, buildProductTrend } from "./productTrend.js";

const now = new Date(2026, 9, 10, 12);
test("current calendar periods, including month and year boundaries", () => {
  assert.deepEqual(productTrendRange("weekly", "", "", now), {start:"2026-10-05", end:"2026-10-11", today:"2026-10-10"});
  assert.deepEqual(productTrendRange("monthly", "", "", now), {start:"2026-10-01", end:"2026-10-31", today:"2026-10-10"});
  assert.equal(productTrendRange("weekly", "", "", new Date(2027, 0, 1, 12)).start, "2026-12-28");
});
test("fixed period top five, daily zeroes, and blank future dates", () => {
  const rows = ["A", "B", "C", "D", "E", "F"].map((style, i) => ({date:"2026-10-05", style, qty:10-i}));
  rows.push({date:"2026-10-06",style:"F",qty:30}, {date:"2026-10-11",style:"G",qty:999}, {date:"2026-09-30",style:"H",qty:999});
  const result=buildProductTrend(rows,"weekly",productTrendRange("weekly","","",now));
  assert.deepEqual(result.products.map(p=>p.name),["F","A","B","C","D"]);
  assert.equal(result.points.length,7);
  assert.equal(result.points[0].product0,5);
  assert.equal(result.points[1].product0,30);
  assert.equal(result.points[2].product0,0);
  assert.equal(result.points[6].product0,null);
});
test("monthly weeks are clipped to month and retain the same products", () => {
  const rows=[{date:"2026-10-01",style:"A",qty:20},{date:"2026-10-04",style:"A",qty:5},{date:"2026-10-05",style:"A",qty:10},{date:"2026-10-07",style:"B",qty:50}];
  const {products,points}=buildProductTrend(rows,"monthly",productTrendRange("monthly","","",now));
  assert.deepEqual(products.map(p=>p.name),["B","A"]);
  assert.equal(points[0].dateRange,"2026-10-01 – 2026-10-04");
  assert.equal(points[0].product1,25);
  assert.equal(points[1].product1,10);
  assert.equal(points[1].product0,50);
  assert.equal(points[2].product0,null);
  assert.equal(points.at(-1).dateRange,"2026-10-26 – 2026-10-31");
});
test("custom period uses daily quantities and deterministic ties", () => {
  const range={start:"2026-10-01",end:"2026-10-02",today:"2026-10-10"};
  const result=buildProductTrend([{date:range.start,style:"B",qty:2},{date:range.end,style:"A",qty:2}],"custom",range);
  assert.deepEqual(result.products.map(p=>p.name),["A","B"]);
  assert.equal(result.points[0].product0,0);
  assert.equal(result.points[1].product0,2);
  assert.deepEqual(buildProductTrend([],"custom",range).products,[]);
});
