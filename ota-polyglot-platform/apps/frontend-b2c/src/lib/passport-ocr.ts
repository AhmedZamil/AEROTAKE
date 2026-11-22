import { isPlausiblePassportNumber } from "@/lib/passport";

export { isPlausiblePassportNumber } from "@/lib/passport";

export type PassportOcrResult = {
  title: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  passportNumber: string;
  nationality?: string;
  expiryDate?: string;
  source: "mrz" | "text" | "failed";
  rawText?: string;
};

function cleanMrzChar(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9<]/g, "")
    .replace(/[O]/g, "0");
}

function normalizeMrzLine(line: string) {
  return line
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[«»]/g, "<")
    .replace(/[^A-Z0-9<]/g, "");
}

/** Repair common OCR substitutions inside an MRZ candidate. */
export function repairMrzCandidate(line: string) {
  let value = normalizeMrzLine(line);
  // OCR often reads < as K or L
  value = value.replace(/<[KL]/g, "<<");
  value = value.replace(/([A-Z0-9])K([A-Z<])/g, "$1<$2");
  value = value.replace(/([A-Z0-9])L([A-Z<])/g, "$1<$2");
  // Trailing chevron noise as LLLLL / SSSS / KKKK
  value = value.replace(/[KLS]{3,}/g, (match) => "<".repeat(match.length));
  if (value.includes("P<")) {
    value = value.slice(value.indexOf("P<"));
  }
  value = value.replace(/<{3,}/g, "<<");
  return value;
}

function titleFromGender(gender: string) {
  if (gender === "female") return "ms";
  if (gender === "male") return "mr";
  return "mr";
}

function parseMrzDate(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = yy >= 50 ? 1900 + yy : 2000 + yy;
  return `${String(year).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function parseGender(code: string) {
  if (code === "F") return "female";
  if (code === "M") return "male";
  return "";
}

function formatNamePart(value: string) {
  const cleaned = value
    .replace(/<+/g, " ")
    .replace(/[LS]{2,}$/g, "")
    .replace(/[^A-Z\s\-']/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

/** Line 1 of TD3 MRZ starts with P< + 3-letter issuer (e.g. P<BGD...). */
function looksLikeMrzLine1(line: string): boolean {
  return /^P<[A-Z]{3}/.test(line) && line.includes("<") && line.length >= 28;
}

function looksLikeMrzLine2(line: string): boolean {
  return /^[A-Z0-9<]{28,}$/.test(line) && /[0-9]/.test(line) && line.length >= 28;
}

/** ICAO TD3 passport MRZ (2 x 44). */
export function parsePassportMrz(line1Raw: string, line2Raw: string): PassportOcrResult | null {
  let line1 = repairMrzCandidate(line1Raw);
  let line2 = repairMrzCandidate(line2Raw);

  if (!line1.startsWith("P<") || line1.length < 20) return null;
  if (line2.length < 28) return null;

  line1 = line1.padEnd(44, "<").slice(0, 44);
  line2 = line2.padEnd(44, "<").slice(0, 44);

  // TD3: positions 0–1 = "P<", 2–4 = issuer (e.g. BGD), 5–43 = names.
  const nameField = line1.slice(5);
  const [surnameRaw = "", givenRaw = ""] = nameField.split("<<");
  const lastName = formatNamePart(surnameRaw);
  const firstName = formatNamePart(givenRaw);

  const passportNumber = cleanMrzChar(line2.slice(0, 9)).replace(/</g, "");
  const nationality = line2.slice(10, 13).replace(/</g, "");
  const dob = parseMrzDate(line2.slice(13, 19));
  const gender = parseGender(line2.charAt(20));
  const expiryDate = parseMrzDate(line2.slice(21, 27)) ?? undefined;

  if (!lastName && !firstName && !passportNumber) return null;
  if (passportNumber && !isPlausiblePassportNumber(passportNumber)) return null;

  return {
    title: titleFromGender(gender),
    firstName: firstName || "",
    lastName: lastName || "",
    gender,
    dateOfBirth: dob || "",
    passportNumber: passportNumber || "",
    nationality,
    expiryDate,
    source: "mrz",
  };
}

export function findMrzLines(text: string): [string, string] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => repairMrzCandidate(line))
    .filter((line) => line.length >= 20);

  for (let i = 0; i < lines.length; i += 1) {
    const a = lines[i];
    // Require P<CCC — never treat "PERSONALDATA..." as MRZ line 1.
    if (!looksLikeMrzLine1(a) && !/^P<[A-Z]{3}/.test(a)) continue;
    const b = lines[i + 1];
    if (b && looksLikeMrzLine2(b)) {
      return [a.startsWith("P<") ? a : a.slice(a.indexOf("P<")), b];
    }
  }

  for (let i = 0; i < lines.length - 1; i += 1) {
    if (/^P<[A-Z]{3}/.test(lines[i]) && looksLikeMrzLine2(lines[i + 1])) {
      return [lines[i], lines[i + 1]];
    }
  }

  // Joined MRZ on one line / paragraph (common when OCR drops newlines).
  const compact = repairMrzCandidate(text);
  const match = compact.match(/(P<[A-Z]{3}[A-Z0-9<]{20,})([A-Z0-9][A-Z0-9<]{27,})/);
  if (match) return [match[1], match[2]];

  return null;
}

function parseLoosePassportText(text: string): PassportOcrResult | null {
  const upper = text.toUpperCase();

  const passportMatch =
    upper.match(/PASSPORT\s*(?:NO|NUMBER|#)\.?\s*[:\s]*([A-Z][A-Z0-9]{5,11})/) ||
    upper.match(/DOCUMENT\s*(?:NO|NUMBER|#)\.?\s*[:\s]*([A-Z][A-Z0-9]{5,11})/) ||
    // Standalone ICAO-style number (letter + digits), never a word like PERSONAL.
    upper.match(/\b([A-Z]\d{7,9})\b/);

  const surnameMatch =
    upper.match(/SURNAME\s*\/?\s*NOM(?:\s*\/\s*APELLIDOS?)?\s*[:\s]*([A-Z\s\-']{2,40})/) ||
    upper.match(/SURNAME\s*[:\s]*([A-Z\s\-']{2,40})/);
  const givenMatch =
    upper.match(
      /GIVEN\s*NAMES?\s*\/?\s*PRENOMS?(?:\s*\/\s*NOMBRES?)?\s*[:\s]*([A-Z\s\-']{2,40})/,
    ) ||
    upper.match(/GIVEN\s*NAMES?\s*[:\s]*([A-Z\s\-']{2,40})/);

  // Bangladesh / open-book: "Name: ASHFIN AHMED SHAFIN" on emergency page.
  const fullNameMatch = upper.match(
    /(?:^|\n)\s*(?:H(?:OLDER)?['’]?\s*)?NAME\s*[:\s]+([A-Z][A-Z\s\-']{3,50})/,
  );

  const sexMatch =
    upper.match(/\bSEX\s*\/?\s*SEXE\s*[:\s]*([MF])\b/) ||
    upper.match(/\bSEX\s*[:\s]*([MF])\b/) ||
    upper.match(/\b([MF])\b(?=[^\n]{0,12}(?:SEX|FEMALE|MALE))/);
  const dobMatch =
    upper.match(
      /DATE OF BIRTH[^\n]*?(\d{1,2}\s*[A-Z]{3}\s*\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})/,
    ) || upper.match(/\b(\d{1,2}\s*[A-Z]{3}\s*\d{4})\b/);

  let passportNumber = (passportMatch?.[1] ?? "").replace(/[^A-Z0-9]/g, "");
  if (passportNumber && !isPlausiblePassportNumber(passportNumber)) {
    passportNumber = "";
  }

  const months: Record<string, string> = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
  };

  let dateOfBirth = "";
  if (dobMatch?.[1]) {
    const raw = dobMatch[1].replace(/\s+/g, " ").trim();
    const m =
      raw.match(/^(\d{1,2})\s([A-Z]{3})\s(\d{4})$/) ||
      raw.match(/^(\d{1,2})([A-Z]{3})(\d{4})$/);
    if (m) {
      dateOfBirth = `${m[3]}-${months[m[2]] ?? "01"}-${m[1].padStart(2, "0")}`;
    }
  }

  let firstName = formatNamePart((givenMatch?.[1] ?? "").split(/[\n/]/)[0] ?? "");
  let lastName = formatNamePart((surnameMatch?.[1] ?? "").split(/[\n/]/)[0] ?? "");

  if (!firstName && !lastName && fullNameMatch?.[1]) {
    const parts = formatNamePart(fullNameMatch[1].split(/[\n/]/)[0] ?? "").split(" ");
    if (parts.length >= 2) {
      lastName = parts[parts.length - 1] ?? "";
      firstName = parts.slice(0, -1).join(" ");
    }
  }

  const gender =
    sexMatch?.[1] === "F" ? "female" : sexMatch?.[1] === "M" ? "male" : "";

  if (!passportNumber && !firstName && !lastName) return null;

  return {
    title: titleFromGender(gender),
    firstName,
    lastName,
    gender,
    dateOfBirth,
    passportNumber,
    source: "text",
    rawText: text,
  };
}

async function loadBitmap(source: File | Blob | string) {
  if (typeof source === "string") {
    if (source.startsWith("data:") || source.startsWith("blob:") || /^https?:/i.test(source)) {
      return createImageBitmap(await (await fetch(source)).blob());
    }
    // Local/file path is not used in browser; treat as URL.
    return createImageBitmap(await (await fetch(source)).blob());
  }
  return createImageBitmap(source);
}

type CanvasCrop = {
  /** 0–1 from top of full image. */
  top: number;
  /** 0–1 height of the band. */
  height: number;
};

async function toCanvas(
  source: File | Blob | string,
  options?: { crop?: CanvasCrop; binarize?: boolean },
): Promise<HTMLCanvasElement> {
  const image = await loadBitmap(source);
  const canvas = document.createElement("canvas");
  const maxWidth = 1800;
  const scale = Math.min(1, maxWidth / image.width);
  const fullWidth = Math.max(1, Math.round(image.width * scale));

  const topFrac = options?.crop?.top ?? 0;
  const heightFrac = options?.crop?.height ?? 1;
  const srcY = image.height * topFrac;
  const srcH = image.height * heightFrac;
  const outHeight = Math.max(1, Math.round(srcH * scale));

  canvas.width = fullWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(image, 0, srcY, image.width, srcH, 0, 0, canvas.width, canvas.height);

  if (options?.binarize === false) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const boosted = gray > 170 ? 255 : gray < 80 ? 0 : gray;
    data[i] = data[i + 1] = data[i + 2] = boosted;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

function browserWorkerOptions(onProgress?: (status: string, progress: number) => void) {
  const base =
    typeof window !== "undefined"
      ? `${window.location.origin}/tesseract`
      : "/tesseract";

  return {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/tesseract-core-simd-lstm.wasm.js`,
    workerBlobURL: false as const,
    logger: (message: { status: string; progress?: number }) => {
      if (message.status === "loading tesseract core") {
        onProgress?.("Loading OCR engine...", 0.08);
      } else if (message.status === "initializing tesseract") {
        onProgress?.("Starting OCR...", 0.12);
      } else if (message.status === "loading language traineddata") {
        onProgress?.("Loading language data...", 0.18);
      } else if (
        message.status === "recognizing text" &&
        typeof message.progress === "number"
      ) {
        onProgress?.("Reading passport text...", message.progress);
      }
    },
    errorHandler: (err: unknown) => {
      console.error("[passport-ocr]", err);
    },
  };
}

function mergeOcrResults(
  mrzParsed: PassportOcrResult | null,
  loose: PassportOcrResult | null,
  rawText: string,
): PassportOcrResult {
  if (mrzParsed && loose) {
    return {
      ...mrzParsed,
      firstName: mrzParsed.firstName || loose.firstName,
      lastName: mrzParsed.lastName || loose.lastName,
      dateOfBirth: loose.dateOfBirth || mrzParsed.dateOfBirth,
      passportNumber: mrzParsed.passportNumber || loose.passportNumber,
      gender: mrzParsed.gender || loose.gender,
      title: titleFromGender(mrzParsed.gender || loose.gender),
      source: "mrz",
      rawText,
    };
  }
  if (mrzParsed) return { ...mrzParsed, rawText };
  if (loose) return { ...loose, rawText };
  return {
    title: "mr",
    firstName: "",
    lastName: "",
    gender: "",
    dateOfBirth: "",
    passportNumber: "",
    source: "failed",
    rawText,
  };
}

export async function extractPassportFromImage(
  source: File | Blob | string,
  onProgress?: (status: string, progress: number) => void,
): Promise<PassportOcrResult> {
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  onProgress?.("Preparing passport image...", 0.05);

  // Open-book photos are tall: bio page + MRZ sit in the lower half.
  // Always also read a tight MRZ band at the very bottom.
  const bioCanvas = await toCanvas(source, {
    crop: { top: 0.42, height: 0.58 },
    binarize: false,
  });
  const mrzCanvas = await toCanvas(source, {
    crop: { top: 0.82, height: 0.18 },
    binarize: true,
  });
  const bioImage = canvasToDataUrl(bioCanvas);
  const mrzImage = canvasToDataUrl(mrzCanvas);

  const worker = await createWorker("eng", OEM.LSTM_ONLY, browserWorkerOptions(onProgress));

  try {
    // First pass: unrestricted — better for labels; MRZ still usually survives.
    onProgress?.("Reading passport bio page...", 0.25);
    const bio = await worker.recognize(bioImage);

    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });

    onProgress?.("Reading MRZ code lines...", 0.65);
    const mrzBand = await worker.recognize(mrzImage);

    const text = `${bio.data.text}\n${mrzBand.data.text}`.trim();
    if (!text) {
      return {
        title: "mr",
        firstName: "",
        lastName: "",
        gender: "",
        dateOfBirth: "",
        passportNumber: "",
        source: "failed",
        rawText: "",
      };
    }

    const mrz =
      findMrzLines(mrzBand.data.text) ??
      findMrzLines(text) ??
      findMrzLines(bio.data.text);
    const mrzParsed = mrz ? parsePassportMrz(mrz[0], mrz[1]) : null;
    const loose = parseLoosePassportText(text);

    onProgress?.("Parsing passport fields...", 0.95);
    return mergeOcrResults(mrzParsed, loose, text);
  } finally {
    await worker.terminate();
  }
}

export function captureVideoFrame(video: HTMLVideoElement): Blob | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const bytes = atob(dataUrl.split(",")[1] ?? "");
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: "image/jpeg" });
}
