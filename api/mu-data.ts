import economyDonationsHandler from "../src/server/handlers/economy-donations.js";
import muDataHandler from "../src/server/handlers/mu-data.js";

export default async function handler(req: any, res: any) {
  if (req.method === "POST") {
    return economyDonationsHandler(req, res);
  }
  return muDataHandler(req, res);
}
