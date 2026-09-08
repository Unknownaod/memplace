import { MongoClient } from "mongodb";

let client;

const BOARD_SIZE = 200;

/*
  Pixel economy
*/
const MAX_BALANCE = 100;
const DAILY_PIXEL_AMOUNT = 100;
const DAILY_RESET_TIME = 24 * 60 * 60 * 1000;
const PIXEL_COOLDOWN = 60 * 1000;

const ALLOWED_COLORS = new Set([
  "#000000",
  "#3b2a1f",
  "#765438",
  "#c8a45d",
  "#e7d7b5",
  "#f3e8cf",
  "#ffffff",
  "#9d3028",
  "#681d19",
  "#c46b2b",
  "#d4ad42",
  "#74733c",
  "#41613b",
  "#263c28",
  "#385a72",
  "#243746",
  "#5c4569",
  "#a86c79",
  "#77736b",
  "#383632"
]);


/* ==========================================
   DATABASE
========================================== */

async function getDb() {

  if (!process.env.MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is missing"
    );
  }

  if (!client) {
    client =
      new MongoClient(
        process.env.MONGODB_URI
      );

    await client.connect();
  }

  return client.db(
    process.env.MONGODB_DB ||
    "middle_eastern_mixing"
  );
}


/* ==========================================
   COOKIE
========================================== */

function getCookie(req, name) {

  const cookieHeader =
    req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies =
    cookieHeader.split(";");

  for (const cookie of cookies) {

    const [
      key,
      ...valueParts
    ] =
      cookie
        .trim()
        .split("=");

    if (key === name) {

      return decodeURIComponent(
        valueParts.join("=")
      );

    }
  }

  return null;
}


/* ==========================================
   DAILY PIXEL REFILL
========================================== */

function calculateDailyRefill(user) {

  const now =
    Date.now();

  let balance =
    Number(user.balance) || 0;

  const lastDailyRefill =
    user.lastDailyRefill
      ? new Date(
          user.lastDailyRefill
        ).getTime()
      : null;


  /*
    If the user doesn't have a
    refill timestamp yet, initialize it.

    This prevents an existing user from
    suddenly receiving a large amount
    of pixels when this system is first
    enabled.
  */

  if (!lastDailyRefill) {

    return {
      balance:
        Math.min(
          MAX_BALANCE,
          balance
        ),

      lastDailyRefill:
        new Date()
    };

  }


  /*
    Check whether 24 hours have passed.
  */

  const elapsed =
    now -
    lastDailyRefill;


  if (
    elapsed <
    DAILY_RESET_TIME
  ) {

    return {
      balance,

      lastDailyRefill:
        user.lastDailyRefill
    };

  }


  /*
    Calculate how many complete
    24-hour periods have passed.
  */

  const daysPassed =
    Math.floor(
      elapsed /
      DAILY_RESET_TIME
    );


  /*
    Give 100 pixels per day.

    Balance can never exceed 100.
  */

  const newBalance =
    Math.min(
      MAX_BALANCE,

      balance +
      (
        daysPassed *
        DAILY_PIXEL_AMOUNT
      )
    );


  /*
    Move the refill timestamp forward
    by the number of complete days.
  */

  const newLastDailyRefill =
    new Date(
      lastDailyRefill +
      (
        daysPassed *
        DAILY_RESET_TIME
      )
    );


  /*
    If the user reached 100,
    don't allow old unused refill time
    to build up indefinitely.

    The next refill will happen
    24 hours from this point.
  */

  if (
    newBalance >=
    MAX_BALANCE
  ) {

    return {
      balance:
        MAX_BALANCE,

      lastDailyRefill:
        new Date()
    };

  }


  return {
    balance:
      newBalance,

    lastDailyRefill:
      newLastDailyRefill
  };

}


/* ==========================================
   HANDLER
========================================== */

export default async function handler(
  req,
  res
) {

  if (req.method !== "POST") {

    return res.status(405).json({
      error:
        "Method not allowed"
    });

  }


  try {

    /* ======================================
       AUTHENTICATION
    ====================================== */

    const sessionId =
      getCookie(
        req,
        "mem_session"
      );

    if (!sessionId) {

      return res.status(401).json({
        error:
          "You must connect Discord before placing pixels."
      });

    }


    const db =
      await getDb();

    const sessions =
      db.collection("sessions");

    const users =
      db.collection("users");

    const pixels =
      db.collection("pixels");

    const bans =
      db.collection("bans");


    /* ======================================
       SESSION
    ====================================== */

    const session =
      await sessions.findOne({
        _id: sessionId
      });

    if (!session) {

      return res.status(401).json({
        error:
          "Your session is invalid. Please reconnect Discord."
      });

    }


    /* ======================================
       SESSION EXPIRATION
    ====================================== */

    if (
      session.expiresAt &&
      new Date(
        session.expiresAt
      ).getTime() < Date.now()
    ) {

      await sessions.deleteOne({
        _id: sessionId
      });

      res.setHeader(
        "Set-Cookie",
        "mem_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
      );

      return res.status(401).json({
        error:
          "Your session has expired. Please reconnect Discord."
      });

    }


    const userId =
      session.userId;

    if (!userId) {

      return res.status(401).json({
        error:
          "Invalid session."
      });

    }


    /* ======================================
       REQUEST
    ====================================== */

    const {
      x,
      y,
      color
    } =
      req.body || {};


    /* ======================================
       COORDINATES
    ====================================== */

    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x >= BOARD_SIZE ||
      y < 0 ||
      y >= BOARD_SIZE
    ) {

      return res.status(400).json({
        error:
          "Invalid coordinates"
      });

    }


    /* ======================================
       COLOR
    ====================================== */

    if (
      typeof color !== "string" ||
      !ALLOWED_COLORS.has(
        color.toLowerCase()
      )
    ) {

      return res.status(400).json({
        error:
          "Invalid color"
      });

    }

    const normalizedColor =
      color.toLowerCase();


    /* ======================================
       FIND USER
    ====================================== */

    const user =
      await users.findOne({
        _id: userId
      });

    if (!user) {

      return res.status(404).json({
        error:
          "User account not found."
      });

    }


    /* ======================================
       DAILY PIXEL REFILL
    ====================================== */

    const regenerated =
      calculateDailyRefill(
        user
      );


    /*
      Save the new balance/refill time
      if anything changed.
    */

    if (
      regenerated.balance !==
        (Number(user.balance) || 0)
      ||
      String(
        regenerated.lastDailyRefill || ""
      ) !==
      String(
        user.lastDailyRefill || ""
      )
    ) {

      await users.updateOne(
        {
          _id: userId
        },

        {
          $set: {

            balance:
              regenerated.balance,

            lastDailyRefill:
              regenerated.lastDailyRefill,

            updatedAt:
              new Date()

          }
        }
      );

      user.balance =
        regenerated.balance;

      user.lastDailyRefill =
        regenerated.lastDailyRefill;

    }


    /* ======================================
       BAN
    ====================================== */

    const ban =
      await bans.findOne({
        userId,
        active: true
      });

    if (ban) {

      return res.status(403).json({
        error:
          "You are banned from drawing."
      });

    }


    /* ======================================
       BALANCE
    ====================================== */

    if (
      (user.balance || 0) <= 0
    ) {

      return res.status(400).json({
        error:
          "You don't have any pixels available."
      });

    }


    /* ======================================
       PLACEMENT COOLDOWN
    ====================================== */

    if (user.lastPlacement) {

      const elapsed =
        Date.now() -
        new Date(
          user.lastPlacement
        ).getTime();

      if (
        elapsed <
        PIXEL_COOLDOWN
      ) {

        const remaining =
          Math.ceil(
            (
              PIXEL_COOLDOWN -
              elapsed
            ) / 1000
          );

        return res.status(429).json({

          error:
            "Pixel cooldown active",

          remaining

        });

      }

    }


    /* ======================================
       EXISTING PIXEL
    ====================================== */

    const pixelId =
      `${x}:${y}`;

    const existingPixel =
      await pixels.findOne({
        _id: pixelId
      });


    /* ======================================
       CLAN PROTECTION
    ====================================== */

    if (
      existingPixel &&
      existingPixel.clanId &&
      user.clanId &&
      existingPixel.clanId ===
        user.clanId
    ) {

      return res.status(403).json({
        error:
          "Your clan cannot paint over its own pixels."
      });

    }


    const now =
      new Date();


    /* ======================================
       REMOVE PIXEL FROM BALANCE
    ====================================== */

    const updatedUser =
      await users.findOneAndUpdate(

        {
          _id:
            userId,

          balance: {
            $gt: 0
          },

          /*
            Prevent two simultaneous
            placement requests.
          */

          $or: [

            {
              lastPlacement:
                null
            },

            {
              lastPlacement: {
                $exists:
                  false
              }
            },

            {
              lastPlacement: {
                $lte:
                  new Date(
                    Date.now() -
                    PIXEL_COOLDOWN
                  )
              }
            }

          ]

        },

        {
          $inc: {

            balance:
              -1,

            pixelsPlaced:
              1

          },

          $set: {

            lastPlacement:
              now,

            updatedAt:
              now

          }

        },

        {
          returnDocument:
            "after"
        }

      );


    /*
      If this fails, don't place
      the pixel.
    */

    if (!updatedUser) {

      return res.status(429).json({

        error:
          "Pixel cooldown active or balance unavailable.",

        remaining:
          PIXEL_COOLDOWN / 1000

      });

    }


    /* ======================================
       SAVE PIXEL
    ====================================== */

    try {

      await pixels.updateOne(

        {
          _id:
            pixelId
        },

        {
          $set: {

            x,
            y,

            color:
              normalizedColor,

            userId,

            username:
              user.username ||
              "Discord User",

            clanId:
              user.clanId ||
              null,

            placedAt:
              now

          }
        },

        {
          upsert:
            true
        }

      );

    } catch (pixelError) {

      /*
        If saving the pixel fails,
        refund the pixel.
      */

      await users.updateOne(

        {
          _id:
            userId
        },

        {
          $inc: {

            balance:
              1,

            pixelsPlaced:
              -1

          },

          $set: {

            updatedAt:
              new Date()

          }

        }

      );

      throw pixelError;

    }


    /* ======================================
       RESPONSE
    ====================================== */

    return res.status(200).json({

      success:
        true,

      pixel: {

        x,
        y,

        color:
          normalizedColor,

        userId,

        username:
          user.username ||
          "Discord User",

        clanId:
          user.clanId ||
          null,

        placedAt:
          now

      },

      balance:
        updatedUser.balance ??
        0,

      pixelsPlaced:
        updatedUser.pixelsPlaced ??
        0,

      cooldown:
        PIXEL_COOLDOWN,

      regeneration: {

        amount:
          DAILY_PIXEL_AMOUNT,

        every:
          DAILY_RESET_TIME,

        maximum:
          MAX_BALANCE

      }

    });

  } catch (error) {

    console.error(
      "Pixel placement error:",
      error
    );

    return res.status(500).json({

      error:
        "Failed to place pixel",

      message:
        error.message

    });

  }

}
