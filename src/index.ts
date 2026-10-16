import Handlebars from "handlebars";

export type SchemaType = "object" | "array" | "any";

export type SchemaNode = {
    _type: SchemaType;
    _optional: boolean;
} & { [segment: string]: SchemaNode };

export type Schema = {
    _type?: SchemaType;
    _optional?: undefined;
} & { [segment: string]: SchemaNode };

interface SchemaBuilder {
    _type?: SchemaType;
    _optional?: boolean;
    [segment: string]: SchemaBuilder | SchemaType | boolean | undefined;
}

/** Un-flattened walker path: path-part arrays, plus `"#"` for array items. */
export type ContextPath = Array<string | string[]>;

export type ExtractCallback = (path: string[], optional: boolean) => void;

export interface HelperConfig {
    contextParam?: number;
    optional?: boolean;
    transmogrify?: (path: ContextPath) => ContextPath;
}

export type HelperDetails = Record<string, HelperConfig | undefined>;

interface PathNode {
    original: string;
    parts: string[];
}

interface AstNode extends PathNode {
    type: string;
    body: AstNode[];
    path: AstNode;
    params: AstNode[];
    program: AstNode;
}

type Emit = (path: ContextPath | undefined, optional: boolean) => void;

const extract = (template: string, callback: ExtractCallback, opts: HelperDetails = {}) => {
    const emit: Emit = (segs, optional) => {
        callback((segs || []).flat(), optional);
    };

    const helperDetails: HelperDetails = {
        each: {
            contextParam: 0,
            transmogrify(path) {
                const clone = path.slice(0);
                clone.push("#");
                return clone;
            }
        },
        with: {
            contextParam: 0
        },
        if: {
            optional: true
        },
        ...opts
    };

    const parsed = Handlebars.parse(template) as unknown as AstNode;

    const extend = (path: ContextPath, subpath: PathNode): ContextPath | undefined => {
        if (subpath.original?.startsWith("@root")) {
            const clone = [...subpath.parts];
            return [clone.slice(1)];
        } else if (subpath.original?.startsWith("@")) {
            // do nothing
        } else if (subpath.original?.startsWith("../")) {
            const clone = path[path.length - 1] === "#" ? path.slice(0, -2) : path.slice(0, -1);
            clone.push(subpath.parts);
            return clone;
        } else {
            const clone = [...path];
            clone.push(subpath.parts);
            return clone;
        }
    };

    const visit = (emit: Emit, path: ContextPath, node: AstNode, optional: boolean = false) => {
        let helper: HelperConfig | undefined;
        const childOptional = (details: HelperConfig | undefined): boolean => Boolean(optional || details?.optional);
        switch (node.type) {
            case "Program":
                node.body.forEach((child) => visit(emit, path, child, optional));
                break;

            case "BlockStatement": {
                helper = helperDetails[node.path.original];
                let newPath: ContextPath | undefined = path;
                node.params.forEach((child) => visit(emit, path, child, childOptional(helper)));
                const contextParam = helper != null ? helper.contextParam : undefined;
                if (contextParam != null) {
                    const replace = (next: ContextPath | undefined) => {
                        newPath = next;
                    };
                    visit(replace, path, node.params[contextParam]);
                    if ((helper != null ? helper.transmogrify : undefined) != null) {
                        const details = helperDetails[node.path.original];
                        newPath =
                            details?.transmogrify != null ? details.transmogrify(newPath as ContextPath) : undefined;
                    }
                }
                visit(emit, newPath as ContextPath, node.program, childOptional(helper));
                break;
            }
            case "PathExpression":
                emit(extend(path, node), optional);
                break;

            case "SubExpression":
                node.params.forEach((child) => visit(emit, path, child, childOptional(helper)));
                break;
            case "MustacheStatement":
                helper = helperDetails[node.path.original];
                if (node.params.length === 0) {
                    visit(emit, path, node.path, optional);
                } else {
                    node.params.forEach((child) => visit(emit, path, child, childOptional(helper)));
                }
                break;
        }
    };

    return visit(emit, [], parsed);
};

const extractSchema = (template: string, opts: HelperDetails = {}): Schema => {
    const obj: SchemaBuilder = {};
    const callback: ExtractCallback = (path, optional) => {
        const augment = (node: SchemaBuilder, segments: string[]): SchemaBuilder => {
            node._optional = Object.prototype.hasOwnProperty.call(node, "_optional")
                ? optional && node._optional
                : optional;
            if (!(segments.length === 0 || (segments.length === 1 && segments[0] === "length"))) {
                node._type = "object";
                const segment = segments[0];
                if (segment === "#") {
                    node._type = "array";
                }
                const child = (node[segment] || {}) as SchemaBuilder;
                node[segment] = child;
                return augment(child, segments.slice(1));
            } else {
                node._type = "any";
                return node;
            }
        };
        augment(obj, path);
    };
    extract(template, callback, opts);
    delete obj._optional;
    return obj as Schema;
};

export { extract, extractSchema };
