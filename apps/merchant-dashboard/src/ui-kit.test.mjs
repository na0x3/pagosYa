import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { uiChoice, uiHead, uiOption, uiPill, uiStat, uiSwitch } from "./ui-kit.mjs";

const parse = (html) => new JSDOM(`<body>${html}</body>`).window.document.body.firstElementChild;

test("a section head has an icon box, a titled h3 and one line", () => {
  const head = parse(uiHead({ icon: "store", id: "identityTitle", title: "Identidad <b>", text: "Aparece en el cobro." }));
  assert.equal(head.className, "ui-head");
  assert.ok(head.querySelector(".ui-head-icon svg.ui-icon"));
  assert.equal(head.querySelector("h3").id, "identityTitle");
  assert.equal(head.querySelector("h3").textContent, "Identidad <b>");
  assert.equal(head.querySelector("p").textContent, "Aparece en el cobro.");
  assert.equal(head.querySelector(".ui-count"), null);
});

test("a count of zero is still shown", () => {
  assert.equal(parse(uiHead({ icon: "users", title: "Miembros", count: 0 })).querySelector(".ui-count").textContent, "0");
});

test("an option is a labelled switch that keeps the caller's id and data attributes", () => {
  const label = parse(uiOption({ icon: "package", title: "Pocas <unidades>", text: "Muestra “Solo quedan 3”.", attrs: 'id="lowStock" data-x="1"', checked: true }));
  const input = label.querySelector("input");
  assert.equal(label.className, "ui-option");
  assert.equal(input.type, "checkbox");
  assert.equal(input.getAttribute("role"), "switch");
  assert.equal(input.className, "ui-switch");
  assert.equal(input.id, "lowStock");
  assert.equal(input.dataset.x, "1");
  assert.equal(input.checked, true);
  assert.equal(input.disabled, false);
  assert.equal(label.querySelector("strong").textContent, "Pocas <unidades>");
  assert.ok(label.querySelector(".ui-option-icon svg"));
});

test("an option without an icon or helper line draws neither", () => {
  const label = parse(uiOption({ title: "Solo título", disabled: true }));
  assert.equal(label.querySelector(".ui-option-icon"), null);
  assert.equal(label.querySelector("small"), null);
  assert.equal(label.querySelector("input").disabled, true);
});

test("an inline switch shows its short label", () => {
  const label = parse(uiSwitch({ label: "Cerrado", attrs: 'data-day="0"', checked: true }));
  assert.equal(label.className, "ui-inline-switch");
  assert.equal(label.querySelector("input").getAttribute("role"), "switch");
  assert.equal(label.querySelector("input").dataset.day, "0");
  assert.equal(label.querySelector("span").textContent, "Cerrado");
});

test("a choice card is a radio with its group and value escaped", () => {
  const label = parse(uiChoice({ icon: "mail", group: "mode", value: 'a"b', title: "Captar interesados", text: "Deja su correo.", checked: true }));
  const input = label.querySelector("input");
  assert.equal(label.className, "ui-choice");
  assert.equal(input.type, "radio");
  assert.equal(input.name, "mode");
  assert.equal(input.value, 'a"b');
  assert.equal(input.checked, true);
  assert.ok(label.querySelector(".ui-choice-icon svg"));
});

test("a pill is a small radio with its label right after the input", () => {
  const label = parse(uiPill({ group: "due", value: "7", label: "7 días" }));
  assert.equal(label.className, "ui-pill");
  assert.equal(label.querySelector("input + span").textContent, "7 días");
  assert.equal(label.querySelector("input").checked, false);
});

test("a summary figure carries its tone and corner icon", () => {
  const doc = new JSDOM(`<body><dl>${uiStat({ label: "Vencido", icon: "clock-alert", value: "<span>Bs 10</span>", tone: "warning" })}</dl></body>`).window.document;
  const stat = doc.querySelector(".ui-stat");
  assert.equal(stat.className, "ui-stat is-warning");
  assert.equal(stat.querySelector("dt span").textContent, "Vencido");
  assert.ok(stat.querySelector("dt svg.ui-icon"));
  assert.equal(stat.querySelector("dd span").textContent, "Bs 10");
});
