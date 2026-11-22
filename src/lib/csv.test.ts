import { describe, expect, it } from "bun:test";
import { type CsvCell, toCsv } from "./csv";

describe("toCsv", () => {
  it("uses a BOM, semicolon delimiter and CRLF line endings by default", () => {
    expect(
      toCsv(
        ["A", "B"],
        [
          [1, 2],
          [3, 4],
        ],
      ),
    ).toBe("\uFEFFA;B\r\n1;2\r\n3;4\r\n");
  });

  it("can omit the BOM", () => {
    expect(toCsv(["A"], [[1]], { bom: false })).toBe("A\r\n1\r\n");
  });

  it("quotes cells with the delimiter, double quotes, CR or LF", () => {
    const result = toCsv(
      ["header;with;delimiter"],
      [["a;b", 'say "hi"', "line1\nline2", "line1\rline2"]],
      { bom: false },
    );
    expect(result).toBe(
      '"header;with;delimiter"\r\n"a;b";"say ""hi""";"line1\nline2";"line1\rline2"\r\n',
    );
  });

  it("serializes null, undefined, booleans, numbers and dates", () => {
    const row: CsvCell[] = [
      null,
      undefined,
      true,
      false,
      42,
      -1.5,
      new Date("2026-03-05T13:07:00Z"),
    ];
    expect(toCsv(["n", "u", "t", "f", "num", "neg", "date"], [row], { bom: false })).toBe(
      "n;u;t;f;num;neg;date\r\n;;true;false;42;-1.5;2026-03-05T13:07:00.000Z\r\n",
    );
  });

  it("guards string cells against spreadsheet formula injection", () => {
    const inputs = ["=SUM(A1)", "+cmd", "-cmd", "@cmd", "\ttab"];
    expect(
      toCsv(
        ["v"],
        inputs.map((value) => [value]),
        { bom: false },
      ),
    ).toBe("v\r\n'=SUM(A1)\r\n'+cmd\r\n'-cmd\r\n'@cmd\r\n'\ttab\r\n");
  });

  it("quotes a guarded cell that also contains CR", () => {
    expect(toCsv(["v"], [["\rcr"]], { bom: false })).toBe('v\r\n"\'\rcr"\r\n');
  });

  it("does not guard numbers, including negative ones", () => {
    expect(toCsv(["v"], [[-5], [0], [1.25]], { bom: false })).toBe("v\r\n-5\r\n0\r\n1.25\r\n");
  });

  it("guards header strings as well", () => {
    expect(toCsv(["=H1"], [], { bom: false })).toBe("'=H1\r\n");
  });

  it("supports a custom delimiter", () => {
    expect(toCsv(["a", "b"], [["x,y", "plain"]], { delimiter: ",", bom: false })).toBe(
      'a,b\r\n"x,y",plain\r\n',
    );
  });

  it("still emits one line for an empty table", () => {
    expect(toCsv([], [], { bom: false })).toBe("\r\n");
  });
});
