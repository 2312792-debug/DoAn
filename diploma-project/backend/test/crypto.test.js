// Unit test doc lap cho backend/crypto.js - khong can mang/blockchain, chay bang: node test/crypto.test.js
process.env.FILE_ENC_MASTER_KEY = "test-master-secret-chi-dung-de-kiem-thu";
const assert = require("assert");
const { encryptBuffer, decryptBuffer } = require("../crypto");

const diplomaIdA = "0x" + "11".repeat(32);
const diplomaIdB = "0x" + "22".repeat(32);

function test(name, fn) {
  try {
    fn();
    console.log("OK  -", name);
  } catch (e) {
    console.log("FAIL-", name, "->", e.message);
    process.exitCode = 1;
  }
}

test("ma hoa roi giai ma dung diplomaId -> ra dung noi dung goc", () => {
  const original = Buffer.from("%PDF-1.4 noi dung gia lap cua file bang tot nghiep");
  const packed = encryptBuffer(original, diplomaIdA);
  const decrypted = decryptBuffer(packed, diplomaIdA);
  assert.ok(decrypted.equals(original), "noi dung giai ma phai khop 100% voi ban goc");
});

test("2 lan ma hoa cung noi dung, cung diplomaId -> ciphertext KHAC nhau (IV random moi lan)", () => {
  const original = Buffer.from("noi dung giong het nhau");
  const packed1 = encryptBuffer(original, diplomaIdA);
  const packed2 = encryptBuffer(original, diplomaIdA);
  assert.ok(!packed1.equals(packed2), "ciphertext khong duoc trung nhau giua 2 lan ma hoa");
  // nhung giai ma ca 2 deu phai ra dung ban goc
  assert.ok(decryptBuffer(packed1, diplomaIdA).equals(original));
  assert.ok(decryptBuffer(packed2, diplomaIdA).equals(original));
});

test("giai ma bang SAI diplomaId phai bao loi (khong tra ve du lieu rac)", () => {
  const original = Buffer.from("du lieu bi mat");
  const packed = encryptBuffer(original, diplomaIdA);
  assert.throws(() => decryptBuffer(packed, diplomaIdB), /Unsupported state|bad decrypt|auth/i);
});

test("du lieu bi sua 1 byte (giua duong truyen/luu tru) phai bi phat hien, khong giai ma am tham ra rac", () => {
  const original = Buffer.from("noi dung quan trong khong duoc sua");
  const packed = encryptBuffer(original, diplomaIdA);
  const tampered = Buffer.from(packed);
  tampered[tampered.length - 1] ^= 0xff; // sua byte cuoi cua ciphertext
  assert.throws(() => decryptBuffer(tampered, diplomaIdA));
});

test("thieu FILE_ENC_MASTER_KEY -> bao loi ro rang thay vi crash mo ho", () => {
  const saved = process.env.FILE_ENC_MASTER_KEY;
  delete process.env.FILE_ENC_MASTER_KEY;
  try {
    assert.throws(() => encryptBuffer(Buffer.from("x"), diplomaIdA), /FILE_ENC_MASTER_KEY/);
  } finally {
    process.env.FILE_ENC_MASTER_KEY = saved;
  }
});

test("diplomaId sai dinh dang (khong phai bytes32 hex) -> bao loi ro rang", () => {
  assert.throws(() => encryptBuffer(Buffer.from("x"), "not-a-valid-id"), /diplomaId khong hop le/);
});

console.log("\n=== crypto.js unit tests done ===");
