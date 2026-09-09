/**
 * Lightweight in-game chat profanity filter.
 * Blocks common swear words and simple obfuscations (leet / spaced letters).
 */
"use strict";

/** Always blocked when they appear as a whole token (or obvious variant). */
const BANNED_WORDS = new Set([
  "asshole",
  "bastard",
  "bitch",
  "bitches",
  "bollocks",
  "bullshit",
  "cocksucker",
  "cunt",
  "dumbass",
  "faggot",
  "fuck",
  "fucker",
  "fuckers",
  "fucking",
  "fucks",
  "fucked",
  "goddamn",
  "jackass",
  "motherfucker",
  "nigger",
  "nigga",
  "prick",
  "pussy",
  "shit",
  "shits",
  "shitty",
  "wank",
  "wanker",
  "whore"
]);

/**
 * Short / ambiguous stems — only block as whole tokens so we do not catch
 * "hello", "class", "assistant", etc.
 */
const WHOLE_WORD_ONLY = new Set([
  "anal",
  "anus",
  "arse",
  "ass",
  "cock",
  "crap",
  "damn",
  "dammit",
  "dick",
  "fag",
  "hell",
  "piss",
  "pissed",
  "slut",
  "slutty",
  "twat"
]);

const VARIANT_SUFFIXES = ["", "s", "ed", "er", "ers", "ing", "y", "iest"];

function normalizeToken(token) {
  return String(token || "")
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/\$/g, "s")
    .replace(/!/g, "i")
    .replace(/[@*]/g, "")
    .replace(/[^a-z]/g, "");
}

function alternateTokenForms(token) {
  const lower = String(token || "").toLowerCase();
  const forms = new Set([
    normalizeToken(lower),
    normalizeToken(lower.replace(/[@*]/g, "u")),
    normalizeToken(lower.replace(/[@*]/g, "a"))
  ]);
  forms.delete("");
  return forms;
}

function collapseRepeats(token) {
  return String(token || "").replace(/(.)\1+/g, "$1");
}

function tokenIsBanned(token) {
  const forms = alternateTokenForms(token);
  const candidates = new Set();
  for (const form of forms) {
    candidates.add(form);
    candidates.add(collapseRepeats(form));
  }
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (BANNED_WORDS.has(candidate) || WHOLE_WORD_ONLY.has(candidate)) {
      return true;
    }
    for (const word of BANNED_WORDS) {
      for (const suffix of VARIANT_SUFFIXES) {
        if (candidate === word + suffix) {
          return true;
        }
      }
    }
    for (const word of WHOLE_WORD_ONLY) {
      for (const suffix of VARIANT_SUFFIXES) {
        if (suffix && candidate === word + suffix) {
          return true;
        }
      }
    }
  }
  return false;
}

function containsBannedLanguage(text) {
  const raw = String(text || "");
  if (!raw.trim()) {
    return false;
  }

  const tokens = raw.toLowerCase().split(/[^a-z0-9$@!*]+/i).filter(Boolean);
  for (const token of tokens) {
    if (tokenIsBanned(token)) {
      return true;
    }
  }

  // Spaced / punctuated obfuscation for clear multi-letter swear stems: "f u c k"
  const compact = normalizeToken(raw);
  if (!compact) {
    return false;
  }
  for (const word of BANNED_WORDS) {
    if (word.length >= 4 && compact.includes(word)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  containsBannedLanguage,
  BANNED_WORDS,
  WHOLE_WORD_ONLY
};
