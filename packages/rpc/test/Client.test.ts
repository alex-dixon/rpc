import * as _ from "@effect/rpc/Client"
import type { RpcError } from "@effect/rpc/Error"
import * as DataSource from "@effect/rpc/Resolver"
import * as Router from "@effect/rpc/Router"
import * as RS from "@effect/rpc/Schema"
import * as Server from "@effect/rpc/Server"
import { typeEquals } from "@effect/rpc/test/utils"
import * as S from "@effect/schema/Schema"
import { Tag } from "effect/Context"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as RR from "effect/RequestResolver"
import { describe, expect, it } from "vitest"

const SomeError = S.struct({
  _tag: S.literal("SomeError"),
  message: S.string
})
interface SomeError extends S.Schema.To<typeof SomeError> {}

const makeCounter = () => {
  let count = 0

  return {
    get: Effect.sync(() => count++)
  } as const
}
interface Counter extends ReturnType<typeof makeCounter> {}
const Counter = Tag<Counter>()

const posts = RS.withServiceError(
  RS.make({
    create: {
      input: S.struct({ body: S.string }),
      output: S.struct({ id: S.number, body: S.string })
    }
  }),
  SomeError
)

const schema = RS.make({
  greet: {
    input: S.string,
    output: S.string,
    error: S.never
  },

  fail: {
    input: S.string,
    output: S.string,
    error: SomeError
  },

  failNoInput: {
    output: S.string,
    error: SomeError
  },

  encodeInput: {
    input: S.dateFromString(S.string),
    output: S.dateFromString(S.string)
  },

  currentSpanName: {
    output: S.string
  },

  getCount: {
    input: S.string,
    output: S.number
  },

  posts
})

const router = Router.make(
  schema,
  {
    greet: (name) => Effect.succeed(`Hello, ${name}!`),
    fail: (message) => Effect.fail({ _tag: "SomeError", message }),
    failNoInput: Effect.fail({ _tag: "SomeError", message: "fail" } as const),
    encodeInput: (date) => Effect.succeed(date),
    currentSpanName: Effect.flatMap(Effect.currentSpan, (maybeSpan) =>
      Effect.match(maybeSpan, {
        onFailure: () => "",
        onSuccess: (_) =>
          `${
            Option.getOrElse(
              Option.map(_.parent, (_) => _._tag === "Span" ? _.name : "ExternalSpan"),
              () => ""
            )
          } > ${_.name}`
      })),
    getCount: (_) => Effect.flatMap(Counter, (_) => _.get),
    posts: Router.make(posts, {
      create: (post) =>
        Effect.succeed({
          id: 1,
          body: post.body
        })
    })
  },
  { spanPrefix: "CustomServer" }
)

const handler = Server.handler(router)
const resolver = pipe(
  DataSource.make(handler),
  RR.provideContext(Context.make(Counter, makeCounter()))
)
const client = _.makeWithResolver(schema, resolver)
const clientWithPrefix = _.makeWithResolver(schema, resolver, {
  spanPrefix: "CustomClient"
})

describe("Client", () => {
  it("encoded/", async () => {
    expect(await Effect.runPromise(client.greet("John"))).toEqual(
      "Hello, John!"
    )

    expect(
      await Effect.runPromise(Effect.flip(client.fail("message")))
    ).toEqual({ _tag: "SomeError", message: "message" })

    expect(await Effect.runPromise(Effect.flip(client.failNoInput))).toEqual({
      _tag: "SomeError",
      message: "fail"
    })

    const date = new Date()
    expect(await Effect.runPromise(client.encodeInput(date))).toEqual(date)
  })

  it("encoded/ nested", async () => {
    expect(
      await Effect.runPromise(client.posts.create({ body: "hello" }))
    ).toEqual({ id: 1, body: "hello" })
  })

  it("tracing", async () => {
    expect(await Effect.runPromise(client.currentSpanName)).toEqual(
      "ExternalSpan > CustomServer.currentSpanName"
    )
    expect(await Effect.runPromise(clientWithPrefix.currentSpanName)).toEqual(
      "ExternalSpan > CustomServer.currentSpanName"
    )
  })

  it("nested service errors", () => {
    typeEquals(client.posts.create)<
      (input: {
        readonly body: string
      }) => Effect.Effect<
        never,
        SomeError | RpcError,
        { readonly id: number; readonly body: string }
      >
    >() satisfies true
  })

  it("caching", () => {
    const getA = Effect.withRequestCaching(true)(client.getCount("a"))
    expect(Effect.runSync(getA)).toEqual(0)
    expect(Effect.runSync(getA)).toEqual(0)
    expect(Effect.runSync(client.getCount("b"))).toEqual(1)
    expect(Effect.runSync(client.getCount("a"))).toEqual(2)
  })
})
