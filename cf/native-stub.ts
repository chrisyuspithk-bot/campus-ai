/** Stands in for Node-native packages (sharp, @napi-rs/canvas) in Cloudflare builds. Callers already catch failures or report them as errors. */
function unavailable(): never {
  throw new Error("Image processing is not available on the Cloudflare deployment");
}
export const createCanvas = unavailable;
export default unavailable;
