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

function repairMrzCandidate(line: string) {
  let value = normalizeMrzLine(line);
  // OCR often reads << as <K or <L
  value = value.replace(/<[KL]/g, "<<");
  // Trailing chevron noise as LLLLL / SSSS
  value = value.replace(/L{3,}/g, (match) => "<".repeat(match.length));
  value = value.replace(/S{3,}/g, "<<<");
  if (value.includes("P<")) {
    value = value.slice(value.indexOf("P<"));
  } else if (value.includes("P")) {
    value = value.slice(value.indexOf("P"));
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

/** ICAO TD3 passport MRZ (2 x 44). */
export function parsePassportMrz(line1Raw: string, line2Raw: string): PassportOcrResult | null {
  let line1 = repairMrzCandidate(line1Raw);
  let line2 = repairMrzCandidate(line2Raw);

  if (line1.length < 28 || line2.length < 28) return null;
  if (!line1.startsWith("P")) return null;

  line1 = line1.padEnd(44, "<").slice(0, 44);
  line2 = line2.padEnd(44, "<").slice(0, 44);

  const nameCandidates = [line1.slice(5), line1.slice(2)]
    .map((part) => {
      const [surnameRaw = "", givenRaw = ""] = part.split("<<");
      return {
        lastName: formatNamePart(surnameRaw),
        firstName: formatNamePart(givenRaw),
      };
    })
    .sort((a, b) => {
      const score = (item: { firstName: string; lastName: string }) =>
        (item.firstName ? 10 : 0) + item.lastName.length + item.firstName.length;
      return score(b) - score(a);
    });

  const { lastName, firstName } = nameCandidates[0] ?? {
    lastName: "",
    firstName: "",
  };

  const passportNumber = cleanMrzChar(line2.slice(0, 9)).replace(/</g, "");
  const nationality = line2.slice(10, 13).replace(/</g, "");
  const dob = parseMrzDate(line2.slice(13, 19));
  const gender = parseGender(line2.charAt(20));
  const expiryDate = parseMrzDate(line2.slice(21, 27)) ?? undefined;

  if (!lastName && !firstName && !passportNumber) return null;

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

function findMrzLines(text: string): [string, string] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => repairMrzCandidate(line))
    .filter((line) => line.length >= 20);

  for (let i = 0; i < lines.length; i += 1) {
    const a = lines[i];
    if (!a.includes("P<") && !a.startsWith("P")) continue;
    const b = lines[i + 1];
    if (b && /[0-9]/.test(b) && b.length >= 20) {
      return [a.startsWith("P") ? a : a.slice(a.indexOf("P")), b];
    }
  }

  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i].includes("<<") && /[A-Z0-9]{20,}/.test(lines[i + 1])) {
      return [lines[i], lines[i + 1]];
    }
  }

  const compact = repairMrzCandidate(text);
  const match = compact.match(/(P[A-Z0-9<]{20,})([0-9A-Z<]{20,})/);
  if (match) return [match[1], match[2]];

  return null;
}

function parseLoosePassportText(text: string): PassportOcrResult | null {
  const upper = text.toUpperCase();

  const passportMatch =
    upper.match(/PASSPORT\s*NO\.?\s*[:\s]*([A-Z0-9]{6,12})/) ||
    upper.match(/\b([A-Z0-9]{8,9})\b/);
  const surnameMatch =
    upper.match(/SURNAME\s*\/?\s*NOM(?:\s*\/\s*APELLIDOS?)?\s*[:\s]*([A-Z\s\-']{2,40})/) ||
    upper.match(/SURNAME\s*[:\s]*([A-Z\s\-']{2,40})/);
  const givenMatch =
    upper.match(
      /GIVEN\s*NAMES?\s*\/?\s*PRENOMS?(?:\s*\/\s*NOMBRES?)?\s*[:\s]*([A-Z\s\-']{2,40})/,
    ) || upper.match(/GIVEN\s*NAMES?\s*[:\s]*([A-Z\s\-']{2,40})/);
  const sexMatch =
    upper.match(/\bSEX\s*\/?\s*SEXE\s*[:\s]*([MF])\b/) ||
    upper.match(/\bSEX\s*[:\s]*([MF])\b/) ||
    upper.match(/\b([MF])\b(?=[^\n]{0,12}(?:SEX|FEMALE|MALE))/);
  const dobMatch =
    upper.match(
      /DATE OF BIRTH[^\n]*?(\d{1,2}\s*[A-Z]{3}\s*\d{2,4}|\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})/,
    ) || upper.match(/\b(\d{1,2}\s*[A-Z]{3}\s*\d{4})\b/);

  if (!passportMatch && !surnameMatch && !givenMatch) return null;

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

  const firstName = formatNamePart((givenMatch?.[1] ?? "").split(/[\n/]/)[0] ?? "");
  const lastName = formatNamePart((surnameMatch?.[1] ?? "").split(/[\n/]/)[0] ?? "");
  const gender =
    sexMatch?.[1] === "F" ? "female" : sexMatch?.[1] === "M" ? "male" : "";

  return {
    title: titleFromGender(gender),
    firstName,
    lastName,
    gender,
    dateOfBirth,
    passportNumber: (passportMatch?.[1] ?? "").replace(/[^A-Z0-9]/g, ""),
    source: "text",
    rawText: text,
  };
}

async function loadBitmap(source: File | Blob | string) {
  if (typeof source === "string") {
    return createImageBitmap(await (await fetch(source)).blob());
  }
  return createImageBitmap(source);
}

async function toCanvas(
  source: File | Blob | string,
  options?: { mrzOnly?: boolean },
): Promise<HTMLCanvasElement> {
  const image = await loadBitmap(source);
  const canvas = document.createElement("canvas");
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / image.width);
  const fullWidth = Math.max(1, Math.round(image.width * scale));
  const fullHeight = Math.max(1, Math.round(image.height * scale));

  if (options?.mrzOnly) {
    const bandTop = Math.floor(fullHeight * 0.62);
    canvas.width = fullWidth;
    canvas.height = Math.max(1, fullHeight - bandTop);
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.drawImage(
      image,
      0,
      image.height * 0.62,
      image.width,
      image.height * 0.38,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  } else {
    canvas.width = fullWidth;
    canvas.height = fullHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const boosted = gray > 150 ? 255 : gray < 100 ? 0 : gray;
    data[i] = data[i + 1] = data[i + 2] = boosted;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
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
      // Prefer labeled visual DOB when present (MRZ YY can be ambiguous on bad scans)
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
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, {
    logger: (message) => {
      if (message.status === "recognizing text" && typeof message.progress === "number") {
        onProgress?.("Reading passport text...", message.progress);
      }
    },
  });

  try {
    onProgress?.("Preparing passport image...", 0.05);
    const fullCanvas = await toCanvas(source);
    const mrzCanvas = await toCanvas(source, { mrzOnly: true });

    await worker.setParameters({
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<abcdefghijklmnopqrstuvwxyz /.-:",
      preserve_interword_spaces: "1",
    });

    onProgress?.("Reading full passport page...", 0.25);
    const full = await worker.recognize(fullCanvas);

    onProgress?.("Reading MRZ code lines...", 0.65);
    const mrzBand = await worker.recognize(mrzCanvas);

    const text = `${full.data.text}\n${mrzBand.data.text}`;
    const mrz = findMrzLines(text) ?? findMrzLines(mrzBand.data.text) ?? findMrzLines(full.data.text);
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
