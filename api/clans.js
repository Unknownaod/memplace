js
import { MongoClient } from "mongodb";

let client;

async function getDb() {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
  }

  return client.db(
    process.env.MONGODB_DB || "middle_eastern_mixing"
  );
}

export default async function handler(req, res) {

  try {

    const db = await getDb();

    const clans =
      db.collection("clans");

    /* GET CLANS */

    if (req.method === "GET") {

      const results =
        await clans
          .find({})
          .sort({
            pixelsPlaced: -1
          })
          .limit(100)
          .toArray();

      return res.status(200).json({
        success: true,
        clans: results
      });

    }


    /* CREATE CLAN */

    if (req.method === "POST") {

      const {
        name,
        description
      } = req.body || {};

      if (
        typeof name !== "string" ||
        name.trim().length < 2 ||
        name.trim().length > 40
      ) {

        return res.status(400).json({
          error: "Invalid clan name"
        });

      }

      const clan = {

        name:
          name.trim(),

        description:
          typeof description === "string"
            ? description.trim().slice(0, 300)
            : "",

        pixelsPlaced: 0,

        createdAt:
          new Date()

      };

      const result =
        await clans.insertOne(clan);

      return res.status(201).json({

        success: true,

        clan: {
          ...clan,
          _id: result.insertedId
        }

      });

    }


    return res.status(405).json({
      error: "Method not allowed"
    });

  } catch (error) {

    console.error(
      "Clan API error:",
      error
    );

    return res.status(500).json({
      error: "Clan operation failed"
    });

  }

}

