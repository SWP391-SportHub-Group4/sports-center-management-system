export function classSportTone(sportName: string) {
  const name = sportName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/badminton|cau long/.test(name)) return "badminton";
  if (/basketball|bong ro/.test(name)) return "basketball";
  return "training";
}
