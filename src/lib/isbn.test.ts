import { expect, test } from "bun:test";
import { isBooklandEan, isbnVariants, toIsbn10, toIsbn13 } from "./isbn";

test("ISBN-10 and ISBN-13 convert both ways", () => {
  expect(toIsbn13("3-16-148410-X")).toBe("9783161484100");
  expect(toIsbn10("978-3-16-148410-0")).toBe("316148410X");
  expect(toIsbn13("0306406152")).toBe("9780306406157");
  expect(toIsbn10("9780306406157")).toBe("0306406152");
  expect(toIsbn10("9791034304601")).toBeNull();
  expect(toIsbn13("9783161484101")).toBeNull();
  expect(isbnVariants("9783161484100")).toEqual(["9783161484100", "316148410X"]);
  expect(isbnVariants("4006381333931")).toEqual(["4006381333931"]);
  expect(isbnVariants("nope")).toEqual([]);
  expect(isBooklandEan("9783161484100")).toBe(true);
  expect(isBooklandEan("4006381333931")).toBe(false);
});
