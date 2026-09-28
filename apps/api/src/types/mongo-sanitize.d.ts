declare module 'mongo-sanitize' {
  function sanitize<T = unknown>(input: T): T;
  export = sanitize;
}
