"""Generate Zed snippet files from data/apim-policies.json.

Usage: python3 scripts/gen_snippets.py

Writes snippets/apim policy.json (offered in policy XML) and
snippets/apim expression.json (offered inside @(...) / @{...}). Zed scopes a
snippet file by the lowercased language name, hence the spaces in the names.

Policy prefixes start with `<`: Zed replaces exactly the text the prefix
matched, so typing `<set-h` and accepting yields `<set-header ...>` rather than
`<<set-header ...>`.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "data" / "apim-policies.json").read_text())
INDENT = "    "

# Hand-written bodies for the policies people type most. Everything else is
# generated from the docs data (required attributes, enum choices).
POLICY_OVERRIDES = {
    "policies": '<policies>\n    <inbound>\n        <base />\n        $0\n    </inbound>\n    <backend>\n        <base />\n    </backend>\n    <outbound>\n        <base />\n    </outbound>\n    <on-error>\n        <base />\n    </on-error>\n</policies>',
    "fragment": "<fragment>\n    $0\n</fragment>",
    "inbound": "<inbound>\n    <base />\n    $0\n</inbound>",
    "backend": "<backend>\n    <base />\n    $0\n</backend>",
    "outbound": "<outbound>\n    <base />\n    $0\n</outbound>",
    "on-error": "<on-error>\n    <base />\n    $0\n</on-error>",
    "base": "<base />",
    "choose": '<choose>\n    <when condition="@(${1:true})">\n        $0\n    </when>\n    <otherwise>\n    </otherwise>\n</choose>',
    "when": '<when condition="@(${1:true})">\n    $0\n</when>',
    "otherwise": "<otherwise>\n    $0\n</otherwise>",
    "set-header": '<set-header name="$1" exists-action="${2|override,skip,append,delete|}">\n    <value>$0</value>\n</set-header>',
    "set-query-parameter": '<set-query-parameter name="$1" exists-action="${2|override,skip,append,delete|}">\n    <value>$0</value>\n</set-query-parameter>',
    "set-variable": '<set-variable name="$1" value="@($2)" />$0',
    "set-body": "<set-body>@{\n    $0\n}</set-body>",
    "set-status": '<set-status code="${1:200}" reason="${2:OK}" />$0',
    "set-method": "<set-method>${1|GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS|}</set-method>$0",
    "set-backend-service": '<set-backend-service ${1|base-url,backend-id|}="$2" />$0',
    "rewrite-uri": '<rewrite-uri template="$1" copy-unmatched-params="${2|true,false|}" />$0',
    "return-response": '<return-response>\n    <set-status code="${1:200}" reason="${2:OK}" />\n    <set-header name="Content-Type" exists-action="override">\n        <value>${3:application/json}</value>\n    </set-header>\n    <set-body>$0</set-body>\n</return-response>',
    "send-request": '<send-request mode="${1|new,copy|}" response-variable-name="$2" timeout="${3:20}" ignore-error="${4|false,true|}">\n    <set-url>$5</set-url>\n    <set-method>${6|GET,POST,PUT,PATCH,DELETE|}</set-method>\n    $0\n</send-request>',
    "send-one-way-request": '<send-one-way-request mode="${1|new,copy|}" timeout="${2:20}">\n    <set-url>$3</set-url>\n    <set-method>${4|POST,GET,PUT,PATCH,DELETE|}</set-method>\n    $0\n</send-one-way-request>',
    "forward-request": '<forward-request timeout="${1:60}" />$0',
    "retry": '<retry condition="@(${1:context.Response.StatusCode >= 500})" count="${2:3}" interval="${3:1}" first-fast-retry="${4|false,true|}">\n    $0\n</retry>',
    "include-fragment": '<include-fragment fragment-id="$1" />$0',
    "authentication-managed-identity": '<authentication-managed-identity resource="$1" />$0',
    "validate-jwt": '<validate-jwt header-name="${1:Authorization}" failed-validation-httpcode="${2:401}" failed-validation-error-message="${3:Unauthorized}" require-scheme="Bearer">\n    <openid-config url="$4" />\n    <audiences>\n        <audience>$5</audience>\n    </audiences>\n    <issuers>\n        <issuer>$6</issuer>\n    </issuers>\n    $0\n</validate-jwt>',
    "validate-azure-ad-token": '<validate-azure-ad-token tenant-id="$1" header-name="${2:Authorization}" failed-validation-httpcode="${3:401}">\n    <client-application-ids>\n        <application-id>$4</application-id>\n    </client-application-ids>\n    $0\n</validate-azure-ad-token>',
    "cors": '<cors allow-credentials="${1|false,true|}">\n    <allowed-origins>\n        <origin>${2:*}</origin>\n    </allowed-origins>\n    <allowed-methods>\n        <method>${3:*}</method>\n    </allowed-methods>\n    <allowed-headers>\n        <header>${4:*}</header>\n    </allowed-headers>\n</cors>$0',
    "rate-limit-by-key": '<rate-limit-by-key calls="${1:10}" renewal-period="${2:60}" counter-key="@(${3:context.Subscription.Id})" />$0',
    "quota-by-key": '<quota-by-key calls="${1:1000}" renewal-period="${2:3600}" counter-key="@(${3:context.Subscription.Id})" />$0',
    "cache-lookup": '<cache-lookup vary-by-developer="${1|false,true|}" vary-by-developer-groups="${2|false,true|}" />$0',
    "cache-store": '<cache-store duration="${1:3600}" />$0',
    "cache-lookup-value": '<cache-lookup-value key="$1" variable-name="$2" />$0',
    "cache-store-value": '<cache-store-value key="$1" value="$2" duration="${3:3600}" />$0',
    "mock-response": '<mock-response status-code="${1:200}" content-type="${2:application/json}" />$0',
    "trace": '<trace source="$1" severity="${2|verbose,information,error|}">\n    <message>$0</message>\n</trace>',
    "log-to-eventhub": '<log-to-eventhub logger-id="$1">@{\n    $0\n}</log-to-eventhub>',
    "emit-metric": '<emit-metric name="$1" value="${2:1}" namespace="$3">\n    <dimension name="$4" value="$5" />\n</emit-metric>$0',
    "llm-token-limit": '<llm-token-limit counter-key="@(${1:context.Subscription.Id})" tokens-per-minute="${2:5000}" estimate-prompt-tokens="${3|false,true|}" />$0',
    "limit-concurrency": '<limit-concurrency key="$1" max-count="${2:1}">\n    $0\n</limit-concurrency>',
    "wait": '<wait for="${1|all,any|}">\n    $0\n</wait>',
    "check-header": '<check-header name="$1" failed-check-httpcode="${2:401}" failed-check-error-message="$3" ignore-case="${4|true,false|}">\n    <value>$0</value>\n</check-header>',
    "ip-filter": '<ip-filter action="${1|allow,forbid|}">\n    <address>$0</address>\n</ip-filter>',
}

# Extra entries alongside the overrides, e.g. alternative forms.
EXTRA_POLICY_SNIPPETS = [
    ("set-variable (literal)", "<set-variable", '<set-variable name="$1" value="$2" />$0', "Stores a literal value in a context variable."),
    ("set-variable (block)", "<set-variable", '<set-variable name="$1" value="@{\n    $0\n}" />', "Stores the result of a multi-statement expression in a context variable."),
    ("set-body (liquid)", "<set-body", '<set-body template="liquid">\n    $0\n</set-body>', "Sets the message body from a Liquid template."),
    ("set-body (literal)", "<set-body", "<set-body>$0</set-body>", "Sets the message body to literal content."),
    ("set-header (delete)", "<set-header", '<set-header name="$1" exists-action="delete" />$0', "Removes an HTTP header."),
]


def generic_policy_body(policy):
    parts = []
    stop = 1
    for attribute in policy["attributes"]:
        if not attribute["required"]:
            continue
        if attribute["values"]:
            parts.append(f'{attribute["name"]}="${{{stop}|{",".join(attribute["values"])}|}}"')
        else:
            parts.append(f'{attribute["name"]}="${stop}"')
        stop += 1
    opening = " ".join([f'<{policy["name"]}', *parts])
    if policy["selfClosing"]:
        return f"{opening} />$0"
    return f"{opening}>\n{INDENT}$0\n</{policy['name']}>"


def policy_description(policy):
    sections = ", ".join(policy["sections"])
    return f'{policy["description"]} ({sections})' if sections else policy["description"]


def policy_snippets():
    snippets = {}
    seen = set()

    def add(name, prefix, body, description):
        snippets[name] = {"prefix": prefix, "body": body, "description": description}

    for policy in DATA["policies"]:
        name = policy["name"]
        seen.add(name)
        add(name, f"<{name}", POLICY_OVERRIDES.get(name) or generic_policy_body(policy), policy_description(policy))

    structural_descriptions = {
        "policies": "Policy document with all four sections.",
        "fragment": "Policy fragment root.",
        "inbound": "Inbound section: runs on the incoming request.",
        "backend": "Backend section: runs before forwarding to the backend.",
        "outbound": "Outbound section: runs on the response.",
        "on-error": "On-error section: runs when an error is raised.",
        "base": "Runs the policies from the enclosing scope.",
        "when": "Conditional branch of a choose policy.",
        "otherwise": "Fallback branch of a choose policy.",
    }
    for name in DATA["structural"]:
        if name in seen:
            continue
        seen.add(name)
        body = POLICY_OVERRIDES.get(name, f"<{name}>$0</{name}>")
        add(name, f"<{name}", body, structural_descriptions.get(name, f"<{name}> element."))

    for name, prefix, body, description in EXTRA_POLICY_SNIPPETS:
        add(name, prefix, body, description)
    return snippets


# Members whose expansion is a call rather than a property read.
MEMBER_BODIES = {
    "GetValueOrDefault": 'GetValueOrDefault("${1:name}", "${2}")',
    "GetValueOrDefault<T>": 'GetValueOrDefault<${1:string}>("${2:name}")',
    "As<T>": "As<${1|string,JObject,JArray,XDocument|}>(preserveContent: ${2|true,false|})",
    "AsFormUrlEncodedContent": "AsFormUrlEncodedContent(preserveContent: ${1|true,false|})",
}

EXTENSION_METHODS = {
    "AsBasic": ("AsBasic()", "Parses a Basic Authorization header value into BasicAuthCredentials (null if invalid)."),
    "TryParseBasic": ("TryParseBasic(out var ${1:credentials})", "Tries to parse a Basic Authorization header value."),
    "AsJwt": ("AsJwt()", "Parses a JWT string into a Jwt (null if invalid)."),
    "TryParseJwt": ("TryParseJwt(out var ${1:jwt})", "Tries to parse a JWT string."),
    "Encrypt": ("Encrypt(${1:alg}, ${2:key}, ${3:iv})", "Encrypts a byte array with a SymmetricAlgorithm."),
    "Decrypt": ("Decrypt(${1:alg}, ${2:key}, ${3:iv})", "Decrypts a byte array with a SymmetricAlgorithm."),
    "VerifyNoRevocation": ("VerifyNoRevocation()", "Validates an X509Certificate2 chain without revocation checks."),
}

EXPRESSION_IDIOMS = [
    ("variable (string cast)", "(string)context.Variables", '(string)context.Variables["${1:name}"]', "Reads a context variable as a string."),
    ("variable (int cast)", "(int)context.Variables", '(int)context.Variables["${1:name}"]', "Reads a context variable as an int."),
    ("variable (bool cast)", "(bool)context.Variables", '(bool)context.Variables["${1:name}"]', "Reads a context variable as a bool."),
    ("request body JSON", "context.Request.Body.As<JObject>", "context.Request.Body.As<JObject>(preserveContent: true)", "Parses the request body as JSON, keeping it readable later."),
    ("response body JSON", "context.Response.Body.As<JObject>", "context.Response.Body.As<JObject>(preserveContent: true)", "Parses the response body as JSON, keeping it readable later."),
    ("JSON error body", "new JObject", 'new JObject(new JProperty("error", new JObject(\n    new JProperty("code", "${1:code}"),\n    new JProperty("message", "${2:message}")))).ToString(Newtonsoft.Json.Formatting.None)', "Builds a JSON error body."),
]


def expression_snippets():
    snippets = {}

    def add(name, prefix, body, description):
        snippets[name] = {"prefix": prefix, "body": body, "description": description}

    add("context", "context", "context", "The policy expression context object.")
    for path, members in DATA["context"].items():
        if not path.startswith("context"):
            continue
        for member in members:
            body_member = MEMBER_BODIES.get(member, member)
            display = member.replace("<T>", "")
            add(f"{path}.{display}", f"{path}.{display}", f"{path}.{body_member}", f"APIM context member {path}.{member}")

    for type_name, members in DATA["context"].items():
        if type_name.startswith("context") or "(extension)" in type_name:
            continue
        for member in members:
            add(f"{type_name}.{member}", member, MEMBER_BODIES.get(member, member), f"{type_name}.{member}")

    for name, (body, description) in EXTENSION_METHODS.items():
        add(name, name, body, description)

    for name, prefix, body, description in EXPRESSION_IDIOMS:
        add(name, prefix, body, description)

    # Allowed .NET types, so the completion list doubles as a reminder of what
    # the gateway permits.
    short_names = {}
    for qualified in DATA["allowedTypes"]:
        bare = qualified.split("<")[0]
        short = bare.split(".")[-1]
        short_names.setdefault(short, []).append(qualified)
    for short, qualified in short_names.items():
        if short == "Extensions":
            continue
        add(f"type {short}", short, short, f"Allowed type: {', '.join(qualified)}")
    return snippets


def main():
    out = ROOT / "snippets"
    out.mkdir(exist_ok=True)
    for file_name, snippets in (("apim policy.json", policy_snippets()), ("apim expression.json", expression_snippets())):
        (out / file_name).write_text(json.dumps(snippets, indent=2) + "\n")
        print(f"{file_name}: {len(snippets)} snippets")


if __name__ == "__main__":
    main()
