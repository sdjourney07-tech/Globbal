/* global GlobbleDictionaryKeys, GlobblePlayableWords, LOCKED_WORDS, DICTIONARY_ALIAS_SOURCE_WORDS */
importScripts(
  "./dictionary-keys.js",
  "./dictionary-alias-sources.js",
  "./dictionary.js",
  "./playable-words.js"
);

const dictionary = GlobbleDictionaryKeys.buildPlayableDictionary(
  typeof LOCKED_WORDS !== "undefined" ? LOCKED_WORDS : [],
  {
    aliasSources:
      typeof DICTIONARY_ALIAS_SOURCE_WORDS !== "undefined"
        ? DICTIONARY_ALIAS_SOURCE_WORDS
        : []
  }
);

self.onmessage = (event) => {
  const { jobId, board, rack, startSquare } = event.data;
  try {
    const count = GlobblePlayableWords.countPlayableWords({
      board,
      rack,
      dictionary,
      startSquare
    });
    self.postMessage({ jobId, count });
  } catch (error) {
    self.postMessage({ jobId, error: error?.message || String(error) });
  }
};
