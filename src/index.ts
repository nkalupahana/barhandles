import Handlebars from "handlebars";

interface HelperDetails {
    each?: {
        contextParam: number;
        transmogrify: (path: any[]) => any[];
    };
    with?: {
        contextParam: number;
    };
    if?: {
        optional: boolean;
    };
    [key: string]: any;
}

const extract = (template: string, callback: Function, opts: HelperDetails = {}) => {
    const emit = (segs: string[], optional: boolean) => {
        callback((segs || []).flat(), optional);
    };

    const helperDetails: HelperDetails = {
        each: {
            contextParam: 0,
            transmogrify(path: any[]) {
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

    const parsed = Handlebars.parse(template);

    const extend = (path: any[], subpath: any) => {
        let clone;
        if (subpath.original?.startsWith("@root")) {
            clone = [...subpath.parts];
            return [clone.slice(1)];
        } else if (subpath.original?.startsWith("@")) {
            // do nothing
        } else if (subpath.original?.startsWith("../")) {
            clone = path[path.length - 1] === "#" ? path.slice(0, -2) : path.slice(0, -1);
            clone.push(subpath.parts);
            return clone;
        } else {
            clone = [...path];
            clone.push(subpath.parts);
            return clone;
        }
    };

    const visit = (emit: Function, path: any[], node: any, optional: boolean = false) => {
        let helper: any;
        switch (node.type) {
            case "Program":
                node.body.forEach((child: any) => visit(emit, path, child, optional));
                break;

            case "BlockStatement": {
                helper = helperDetails[node.path.original];
                let newPath = path;
                node.params.forEach((child: any) =>
                    visit(emit, path, child, optional || (helper != null ? helper.optional : undefined))
                );
                if ((helper != null ? helper.contextParam : undefined) != null) {
                    const replace = (path: any[]) => (newPath = path);
                    visit(replace, path, node.params[helper.contextParam]);
                    if ((helper != null ? helper.transmogrify : undefined) != null) {
                        newPath =
                            helperDetails[node.path.original] != null
                                ? helperDetails[node.path.original].transmogrify(newPath)
                                : undefined;
                    }
                }
                visit(emit, newPath, node.program, optional || (helper != null ? helper.optional : undefined));
                break;
            }
            case "PathExpression":
                emit(extend(path, node), optional);
                break;

            case "SubExpression":
                node.params.forEach((child: any) =>
                    visit(emit, path, child, optional || (helper != null ? helper.optional : undefined))
                );
                break;
            case "MustacheStatement":
                helper = helperDetails[node.path.original];
                if (node.params.length === 0) {
                    visit(emit, path, node.path, optional);
                } else {
                    node.params.forEach((child: any) =>
                        visit(emit, path, child, optional || (helper != null ? helper.optional : undefined))
                    );
                }
                break;
        }
    };

    return visit(emit, [], parsed);
};

const extractSchema = (template: string, opts: HelperDetails = {}) => {
    const obj: any = {};
    const callback = (path: any[], optional: boolean) => {
        const augment = (obj: any, path: any[]): any => {
            obj._optional = obj.hasOwnProperty("_optional") ? optional && obj._optional : optional;
            if (!(path.length === 0 || (path.length === 1 && path[0] === "length"))) {
                obj._type = "object";
                const segment = path[0];
                if (segment === "#") {
                    obj._type = "array";
                }
                obj[segment] = obj[segment] || {};
                return augment(obj[segment], path.slice(1));
            } else {
                obj._type = "any";
                return obj;
            }
        };
        return augment(obj, path);
    };
    extract(template, callback, opts);
    delete obj._optional;
    return obj;
};

export { extract, extractSchema };
