import { test } from "node:test";
import assert from "node:assert/strict";
import { safeProfileData } from "../lib/profile-fields";

test("profile whitelist: прості поля проходять, вкладені записи й службові поля — ні", () => {
  const out = safeProfileData("company", {
    ico: "12345678",
    vatPayer: true,
    clientId: "other",
    id: "x",
    client: { update: { accessCode: "000000", bankAccounts: { updateMany: { where: {}, data: { imapHost: "evil" } } } } },
    unknownField: "x",
  });
  assert.deepEqual(out, { ico: "12345678", vatPayer: true });
});

test("profile whitelist: basic не пускає accessCode / isActive", () => {
  assert.deepEqual(safeProfileData("basic", { name: "A", accessCode: "123456", isActive: false }), { name: "A" });
  assert.equal(safeProfileData("tax", "nope"), undefined);
});
