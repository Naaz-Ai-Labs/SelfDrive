export type DocKind = "licence" | "govt_id" | "address_proof" | "photo" | "other";

export function normalizeDocKind(kind: string): DocKind {
  switch (kind) {
    case "licence":
    case "driver_licence":
      return "licence";
    case "driver_govt_id":
    case "pillion_id":
    case "govt_id":
      return "govt_id";
    case "driver_photo":
    case "pillion_photo":
    case "photo":
      return "photo";
    case "address_proof":
      return "address_proof";
    default:
      return "other";
  }
}
