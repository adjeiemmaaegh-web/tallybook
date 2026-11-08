/** Narrow browser/driver-independent text layout for standard 58 mm or 80 mm thermal paper.
 * The 32/42 character defaults are conservative estimates, not printer certifications.
 * No ESC/POS commands, network calls or silent printer acknowledgements are emitted.
 */
export const THERMAL_COLUMNS = Object.freeze({58:32,80:42});
export function renderThermalReceiptText(receiptText, paperMm=80) {
  const width=THERMAL_COLUMNS[paperMm];
  if(!width) throw new Error("Only 58 mm and 80 mm receipt widths are supported.");
  if(typeof receiptText!=="string"||receiptText.length>20000)throw new Error("Receipt text is unavailable or too large.");
  const clean=receiptText.replace(/\r\n?/g,"\n").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x1B]/g,"").replace(/\t/g," ");
  const output=[];
  for(const line of clean.split("\n")) {
    const characters=Array.from(line);
    if(!characters.length){output.push("");continue;}
    for(let position=0;position<characters.length;position+=width) {
      output.push(characters.slice(position,position+width).join(""));
      if(output.length>1200)throw new Error("Receipt exceeds safe thermal-print length.");
    }
  }
  return output.join("\n").trimEnd()+"\n\n";
}
