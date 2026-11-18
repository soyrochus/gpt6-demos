// Original five-column dot-matrix face for the cabinet score glass.
const glyphs: Record<string, string> = {
  "0": "0e11131519110e",
  "1": "040c040404040e",
  "2": "0e11010204081f",
  "3": "1e01010601011e",
  "4": "02060a121f0202",
  "5": "1f101e0101011e",
  "6": "0610181e11110e",
  "7": "1f010204080808",
  "8": "0e11110e11110e",
  "9": "0e11110f01020c",
  ",": "00000000000c08",
  " ": "00000000000000",
};
export function scoreFace(value: number) {
  const digits = String(Math.max(0, value)).padStart(7, "0");
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let x = 0,
    lit = false,
    dim = "",
    bright = "";
  for (let i = 0; i < formatted.length; i++) {
    const char = formatted[i],
      rows = glyphs[char],
      narrow = char === ",";
    if ((char !== "0" && !narrow) || i === formatted.length - 1) lit = true;
    for (let y = 0; y < 7; y++) {
      const mask = parseInt(rows.slice(y * 2, y * 2 + 2), 16);
      for (let j = 0; j < 5; j++)
        if (mask & (16 >> j)) {
          const point =
            "M" + (x + j - (narrow ? 1 : 0)) + " " + y + "h.83v.83h-.83z";
          if (lit) bright += point;
          else dim += point;
        }
    }
    x += narrow ? 3 : 6;
  }
  return (
    '<svg aria-hidden="true" viewBox="0 0 ' +
    (x - 1) +
    ' 7" preserveAspectRatio="xMinYMid meet"><path fill="#513a28" d="' +
    dim +
    '"/><path fill="#ffac65" d="' +
    bright +
    '"/></svg>'
  );
}
