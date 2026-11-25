"use strict";
importScripts("../js/damage.js");

self.onmessage = ({ data }) => {
  const job = data?.jobs?.[0];
  if (!job) {
    self.postMessage({ error: "Hesaplama işi boş geldi." });
    return;
  }
  try {
    globalThis.D = { rules: data.rules };
    globalThis.searchProgress = (done, total) => self.postMessage({ progress: true, id: job.id, done, total });
    const lists = choicesFrom(data.options || [], new Set(data.s?.qualities || []));
    const result = runJob(job, data.s?.P || {}, lists);
    self.postMessage({ result });
    self.postMessage({ finished: true });
  } catch (error) {
    self.postMessage({ error: String(error?.message || error) });
  } finally {
    delete globalThis.searchProgress;
  }
};
