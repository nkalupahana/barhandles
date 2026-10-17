import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { extract, extractSchema } from "./index";

describe("extract", () => {
    let emit: Mock;

    beforeEach(() => {
        emit = vi.fn();
    });

    it("should allow you to extract simple references", function () {
        extract("{{foo.bar}}", emit);
        expect(emit).toHaveBeenCalledWith(["foo", "bar"], false);
    });

    it("should support 'each'", function () {
        extract("{{#each foo}}{{bar}}{{/each}}", emit);
        expect(emit).toHaveBeenCalledWith(["foo", "#", "bar"], false);
    });

    it("should support 'each' without getting hung up on @index", function () {
        extract("{{#each foo}}{{@index}}{{/each}}", emit);
        expect(emit).not.toHaveBeenCalledWith(["foo", "#", "index"], false);
    });

    it("should support 'with'", function () {
        extract("{{#with foo}}{{bar}}{{/with}}", emit);
        expect(emit).toHaveBeenCalledWith(["foo", "bar"], false);
    });

    it("should support '@root'", function () {
        extract("{{#each foo.bar}}{{@root.bar}}{{/each}}", emit);
        expect(emit).toHaveBeenCalledWith(["bar"], false);
    });

    it("should support '../'", function () {
        extract("{{#with foo}}{{#each bar}}{{../baz}}{{/each}}{{/with}}", emit);
        expect(emit).toHaveBeenCalledWith(["foo", "baz"], false);
    });

    it("should be able to deal with simple extensions", function () {
        extract("{{alt foo.bar foo.baz}}", emit);
        expect(emit).toHaveBeenCalledWith(["foo", "bar"], false);
        expect(emit).toHaveBeenCalledWith(["foo", "baz"], false);
    });

    it("should support generating a schema", function () {
        const template = `\
{{#each foo}}
  {{bar}}
  {{@root.baz}}
  {{../baz}}
{{/each}}\
`;
        expect(extractSchema(template)).toEqual({
            _type: "object",
            foo: {
                _optional: false,
                _type: "array",
                "#": {
                    _optional: false,
                    _type: "object",
                    bar: {
                        _optional: false,
                        _type: "any"
                    }
                }
            },
            baz: {
                _optional: false,
                _type: "any"
            }
        });
    });

    it("no template gives an empty schema", function () {
        expect(extractSchema("")).toEqual({});
    });

    it("should handle simple helpers correctly", function () {
        extract("{{currency amount}}", emit);
        expect(emit).toHaveBeenCalledWith(["amount"], false);
    });

    it("should deal with ifs in a meaningful way", function () {
        extract("{{#if foo}}{{foo.bar}}{{/if}}", emit);
        expect(emit).toHaveBeenCalledWith(["foo"], true);
        expect(emit).toHaveBeenCalledWith(["foo", "bar"], true);
    });

    it("should deal with optionals correctly while generating a schema", function () {
        const template = `\
{{foo.baz}}
{{#if foo}}
{{@root.go}}
{{foo.bar.yoyo}}
{{/if}}\
`;
        expect(extractSchema(template)).toEqual({
            _type: "object",
            foo: {
                _optional: false,
                _type: "object",
                baz: {
                    _optional: false,
                    _type: "any"
                },
                bar: {
                    _optional: true,
                    _type: "object",
                    yoyo: {
                        _optional: true,
                        _type: "any"
                    }
                }
            },
            go: {
                _optional: true,
                _type: "any"
            }
        });
    });

    it("should allow you to add definitions for other directives", function () {
        const template = `\
{{alt foo.bar foo.baz}}\
`;
        extract(template, emit, {
            alt: {
                optional: true
            }
        });
        expect(emit).toHaveBeenCalledWith(["foo", "bar"], true);
    });

    it("should consider all parts of a ternary operator to be optional", function () {
        const template = `\
{{ternary foo.bar foo.baz foo.gum}}\
`;
        expect(
            extractSchema(template, {
                ternary: {
                    optional: true
                }
            })
        ).toEqual({
            _type: "object",
            foo: {
                _optional: true,
                _type: "object",
                bar: {
                    _optional: true,
                    _type: "any"
                },
                baz: {
                    _optional: true,
                    _type: "any"
                },
                gum: {
                    _optional: true,
                    _type: "any"
                }
            }
        });
    });

    it("should ignore variables starting with @", function () {
        const template = `\
{{@foo.bar}}\
`;
        expect(extractSchema(template)).toEqual({
            _type: "any"
        });
    });

    it("should not consider something with length property to be an object", function () {
        const template = `\
{{foo.length}}\
`;
        expect(extractSchema(template)).toEqual({
            _type: "object",
            foo: {
                _optional: false,
                _type: "any"
            }
        });
    });

    it("should handle subexpressions", function () {
        const template = `\
{{#if (isdefined value1)}}true{{else}}false{{/if}}
`;
        expect(extractSchema(template)).toEqual({
            _type: "object",
            value1: {
                _optional: true,
                _type: "any"
            }
        });
    });

    it("should handle literal segments", function () {
        const template = `\
{{[foo.0]}}
`;
        expect(extractSchema(template)).toEqual({
            _type: "object",
            "foo.0": {
                _optional: false,
                _type: "any"
            }
        });
    });
});
