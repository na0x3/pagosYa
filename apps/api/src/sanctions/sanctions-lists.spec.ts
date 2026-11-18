import { compareNames, nameTokens, parseCsv, parseOfacCsv, parseUnXml, prepareEntries, screenNames } from "./sanctions-lists";
import { ALT_FIXTURE, SDN_FIXTURE, UN_FIXTURE } from "./sanctions-fixtures";

describe("sanctions lists", () => {
  it("reads the UN list: people and organisations, aliases, birth dates, entities decoded", () => {
    const { entries, publishedAt } = parseUnXml(UN_FIXTURE);
    expect(publishedAt).toBe("2026-11-18T00:00:04.281Z");
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ source: "UN", externalId: "6907993", kind: "individual", primaryName: "ERIC BADEGE", names: ["ERIC BADEGE"], birthDates: ["1971"], nationalities: ["Democratic Republic of the Congo"], programs: ["DRC"], listedOn: "2012-12-31" });
    expect(entries[1].names).toEqual(["MUHAMMAD AL-RAHMAN", "Abu O'Brien"]);
    expect(entries[1].birthDates).toEqual(["1960-01-02"]);
    expect(entries[2]).toMatchObject({ kind: "entity", names: ["ADF", "Allied Democratic Forces"] });
  });

  it("reads OFAC's CSV with its aliases, skipping vessels", () => {
    expect(parseCsv('1,"a, b",-0- ,"say ""hi"""\n')).toEqual([["1", "a, b", "", 'say "hi"']]);
    const { entries } = parseOfacCsv(SDN_FIXTURE, ALT_FIXTURE);
    expect(entries.map((e) => e.externalId)).toEqual(["2674", "306"]);
    expect(entries[0]).toMatchObject({ kind: "individual", names: ["ABBAS, Abu", 'ABU "EL JEFE" ABBAS'], birthDates: ["10 Dec 1948"], nationalities: ["Iraq"], programs: ["SDGT"] });
    expect(entries[1]).toMatchObject({ kind: "entity", names: ["BANCO NACIONAL DE CUBA", "NATIONAL BANK OF CUBA"] });
  });

  it("compares names without accents, particles, company words, order or a letter's spelling", () => {
    expect(nameTokens("José de la Peña S.R.L.")).toEqual(["jose", "pena"]);
    expect(compareNames(nameTokens("ERIC BADÉGE"), nameTokens("BADEGE, Eric")).possible).toBe(true);
    expect(compareNames(nameTokens("Mohammed Al Rahman"), nameTokens("MUHAMMAD AL-RAHMAN")).possible).toBe(false); // two letters off in a short word
    expect(compareNames(nameTokens("Muhamad Al Rahman"), nameTokens("MUHAMMAD AL-RAHMAN")).possible).toBe(true);
    expect(compareNames(nameTokens("Juan Eric Badege Mamani"), nameTokens("ERIC BADEGE")).possible).toBe(true);
    expect(compareNames(nameTokens("Eric Mamani"), nameTokens("ERIC BADEGE")).possible).toBe(false);
    // One-word listed names match only a short name that is that word.
    expect(compareNames(nameTokens("ADF SRL"), nameTokens("ADF")).possible).toBe(true);
    expect(compareNames(nameTokens("Tienda ADF de Ropa Fina"), nameTokens("ADF")).possible).toBe(false);
  });

  it("screens names against prepared entries, best first, one result per listed entry", () => {
    const entries = [...parseUnXml(UN_FIXTURE).entries, ...parseOfacCsv(SDN_FIXTURE, ALT_FIXTURE).entries].map((e, i) => ({ id: `e${i}`, ...e }));
    const prepared = prepareEntries(entries);
    expect(screenNames(["Ana Pérez", "Rosa Quispe"], prepared)).toEqual([]);
    const hits = screenNames(["Abu Abbas", "Eric Badege"], prepared);
    expect(hits.map((h) => [h.source, h.primaryName, h.score])).toEqual(expect.arrayContaining([["UN", "ERIC BADEGE", 1], ["OFAC", "ABBAS, Abu", 1]]));
    expect(hits.every((h, i) => i === 0 || hits[i - 1].score >= h.score)).toBe(true);
    expect(screenNames(["Banco Nacional de Cuba S.A."], prepared)[0]).toMatchObject({ source: "OFAC", listedName: "BANCO NACIONAL DE CUBA" });
  });
});
