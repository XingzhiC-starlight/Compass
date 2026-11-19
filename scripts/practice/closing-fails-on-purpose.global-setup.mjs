export default function setup() {
  return function closing() {
    throw new Error("the closing step fails on purpose");
  };
}
