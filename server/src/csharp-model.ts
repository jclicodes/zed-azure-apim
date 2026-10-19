// Types available to APIM policy expressions, for member completion and hover.
//
// The `context` object model and APIM's extension methods follow the
// "Context variable" table of the policy expressions reference:
// https://learn.microsoft.com/azure/api-management/api-management-policy-expressions#ContextVariables
// The .NET types are a curated subset of the members people actually use;
// where the reference restricts a type's members (e.g. DateTime), only those
// are listed.
//
// Type strings are C#-like: `string`, `IUrl`, `string[]`, `DateTime?`,
// `IEnumerable<IGroup>`, `IReadOnlyDictionary<string, string[]>`. In member
// types, `T` is the method's own type argument, `E` the receiver's element
// type and `K`/`V` its key/value types.

export type Member = {
  name: string;
  kind: "property" | "method";
  type: string;
  /** Parameter list as written in docs, e.g. `headerName: string, defaultValue: string`. */
  params?: string;
  /** Snippet for the call's arguments (without parentheses); defaults to `$1` when `params` is set. */
  args?: string;
  /** Takes a type argument, e.g. `As<T>()`; the snippet offers `typeArgs` choices. */
  typeArgs?: string[];
  doc?: string;
};

export type TypeDef = {
  doc?: string;
  members: Member[];
  /** Result of `x[...]`. */
  indexer?: string;
  /** Types whose members are inherited. */
  base?: string[];
};

const prop = (name: string, type: string, doc?: string): Member => ({ name, kind: "property", type, ...(doc && { doc }) });
const method = (name: string, params: string, type: string, doc?: string, extra?: Partial<Member>): Member => ({
  name,
  kind: "method",
  type,
  params,
  ...(doc && { doc }),
  ...extra,
});

const BODY_TYPES = ["string", "JObject", "JToken", "JArray", "XNode", "XElement", "XDocument", "byte[]"];

/** Instance members by type name. */
export const TYPES: Record<string, TypeDef> = {
  Context: {
    doc: "The policy expression context, implicitly available in every expression.",
    members: [
      prop("Api", "ContextApi", "The API the request is for."),
      prop("Backend", "Backend", "The backend the request is forwarded to."),
      prop("Deployment", "Deployment", "The API Management deployment handling the request."),
      prop("Elapsed", "TimeSpan", "Time interval between the value of Timestamp and current time."),
      prop("GraphQL", "GraphQL", "GraphQL resolver context."),
      prop("LastError", "LastError", "The error that caused the on-error section to run."),
      prop("Operation", "Operation", "The API operation the request matched."),
      prop("Product", "Product", "The product of the subscription used."),
      prop("Request", "Request", "The incoming request."),
      prop("RequestId", "Guid", "Unique request identifier."),
      prop("Response", "Response", "The response."),
      prop("Subscription", "Subscription", "The subscription used for the request."),
      prop("Timestamp", "DateTime", "Point in time when the request was received."),
      prop("Tracing", "bool", "Indicates if tracing is on or off."),
      prop("User", "User", "The user associated with the subscription."),
      prop("Variables", "Variables", "Context variables set by set-variable and other policies."),
      prop("Workspace", "Workspace", "The workspace the API belongs to."),
      method("Trace", "message: string", "void", "Writes a message to the request trace."),
    ],
  },
  ContextApi: {
    members: [
      prop("Id", "string"),
      prop("IsCurrentRevision", "bool"),
      prop("Name", "string"),
      prop("Path", "string"),
      prop("Protocols", "IEnumerable<string>"),
      prop("Revision", "string"),
      prop("ServiceUrl", "IUrl"),
      prop("SubscriptionKeyParameterNames", "ISubscriptionKeyParameterNames"),
      prop("Version", "string"),
    ],
  },
  Backend: {
    members: [prop("AzureRegion", "string"), prop("Id", "string"), prop("Type", "BackendType", "Single or Pool.")],
  },
  Deployment: {
    members: [
      prop("Gateway", "Gateway"),
      prop("GatewayId", "string", "Returns 'managed' for managed gateways."),
      prop("Region", "string"),
      prop("ServiceId", "string"),
      prop("ServiceName", "string"),
      prop("SustainabilityInfo", "SustainabilityInfo"),
      prop("Certificates", "IReadOnlyDictionary<string, X509Certificate2>"),
    ],
  },
  Gateway: {
    members: [
      prop("Id", "string", "Returns 'managed' for managed gateways."),
      prop("InstanceId", "string", "Returns 'managed' for managed gateways."),
      prop("IsManaged", "bool"),
    ],
  },
  SustainabilityInfo: { members: [prop("CurrentCarbonIntensity", "CarbonIntensityCategory")] },
  GraphQL: { members: [prop("Arguments", "IGraphQLDataObject"), prop("Parent", "IGraphQLDataObject")] },
  LastError: {
    members: ["Source", "Reason", "Message", "Scope", "Section", "Path", "PolicyId"].map((name) => prop(name, "string")),
  },
  Operation: { members: ["Id", "Method", "Name", "UrlTemplate"].map((name) => prop(name, "string")) },
  Product: {
    members: [
      prop("ApprovalRequired", "bool"),
      prop("Groups", "IEnumerable<IGroup>"),
      prop("Id", "string"),
      prop("Name", "string"),
      prop("State", "ProductState", "NotPublished or Published."),
      prop("SubscriptionsLimit", "int?"),
      prop("SubscriptionRequired", "bool"),
    ],
  },
  Request: {
    members: [
      prop("Body", "IMessageBody", "The request body, or null if the request doesn't have one."),
      prop("Certificate", "X509Certificate2", "The client certificate."),
      prop("Foundry", "Foundry"),
      prop("Headers", "HeaderDictionary"),
      prop("IpAddress", "string"),
      prop("MatchedParameters", "IReadOnlyDictionary<string, string>"),
      prop("Method", "string"),
      prop("OriginalUrl", "IUrl"),
      prop("Url", "IUrl"),
      prop("PrivateEndpointConnection", "IPrivateEndpointConnection", "Null if the request doesn't come from a private endpoint connection."),
    ],
  },
  Foundry: { members: [prop("Deployment", "string", "The model deployment ID in Microsoft Foundry associated with the request.")] },
  Response: {
    members: [prop("Body", "IMessageBody"), prop("Headers", "HeaderDictionary"), prop("StatusCode", "int"), prop("StatusReason", "string")],
  },
  Subscription: {
    members: [
      prop("CreatedDate", "DateTime"),
      prop("EndDate", "DateTime?"),
      prop("Id", "string"),
      prop("Key", "string"),
      prop("Name", "string"),
      prop("PrimaryKey", "string"),
      prop("SecondaryKey", "string"),
      prop("StartDate", "DateTime?"),
    ],
  },
  User: {
    members: [
      prop("Email", "string"),
      prop("FirstName", "string"),
      prop("Groups", "IEnumerable<IGroup>"),
      prop("Id", "string"),
      prop("Identities", "IEnumerable<IUserIdentity>"),
      prop("LastName", "string"),
      prop("Note", "string"),
      prop("RegistrationDate", "DateTime"),
    ],
  },
  Workspace: { members: [prop("Id", "string"), prop("Name", "string")] },
  IGroup: { members: [prop("Id", "string"), prop("Name", "string")] },
  IUserIdentity: { members: [prop("Id", "string"), prop("Provider", "string")] },
  IPrivateEndpointConnection: { members: [prop("Name", "string"), prop("GroupId", "string"), prop("MemberName", "string")] },
  ISubscriptionKeyParameterNames: { members: [prop("Header", "string"), prop("Query", "string")] },
  IUrl: {
    members: [
      prop("Host", "string"),
      prop("Path", "string"),
      prop("Port", "int"),
      prop("Query", "QueryDictionary"),
      prop("QueryString", "string"),
      prop("Scheme", "string"),
    ],
  },
  IMessageBody: {
    members: [
      method("As", "preserveContent: bool = false", "T", "Reads the body as T. Without preserveContent: true the body can't be read again.", {
        typeArgs: BODY_TYPES,
        args: "preserveContent: ${2|true,false|}",
      }),
      method("AsFormUrlEncodedContent", "preserveContent: bool = false", "IDictionary<string, IList<string>>", "Reads URL-encoded form data.", {
        args: "preserveContent: ${1|true,false|}",
      }),
    ],
  },
  HeaderDictionary: {
    base: ["IReadOnlyDictionary<string, string[]>"],
    members: [
      method("GetValueOrDefault", "headerName: string, defaultValue: string", "string", "Returns comma-separated header values, or defaultValue if the header isn't found.", {
        args: '"${1:name}"${2:, "${3}"}',
      }),
    ],
  },
  QueryDictionary: {
    base: ["IReadOnlyDictionary<string, string[]>"],
    members: [
      method("GetValueOrDefault", "queryParameterName: string, defaultValue: string", "string", "Returns comma-separated query parameter values, or defaultValue if the parameter isn't found.", {
        args: '"${1:name}"${2:, "${3}"}',
      }),
    ],
  },
  Variables: {
    base: ["IReadOnlyDictionary<string, object>"],
    members: [
      method("GetValueOrDefault", "variableName: string, defaultValue: T", "T", "Returns the variable cast to T, or defaultValue if it isn't set. Throws if the variable has a different type.", {
        typeArgs: ["string", "int", "bool", "JObject", "JArray", "IResponse"],
        args: '"${2:name}"',
      }),
    ],
  },
  ClaimDictionary: {
    base: ["IReadOnlyDictionary<string, string[]>"],
    members: [
      method("GetValueOrDefault", "claimName: string, defaultValue: string", "string", "Returns comma-separated claim values, or defaultValue if the claim isn't found.", {
        args: '"${1:name}"${2:, "${3}"}',
      }),
    ],
  },
  IResponse: {
    doc: "A response stored by send-request in response-variable-name.",
    members: [prop("Body", "IMessageBody"), prop("Headers", "HeaderDictionary"), prop("StatusCode", "int"), prop("StatusReason", "string")],
  },
  Jwt: {
    members: [
      prop("Algorithm", "string"),
      prop("Audiences", "IEnumerable<string>"),
      prop("Claims", "ClaimDictionary"),
      prop("ExpirationTime", "DateTime?"),
      prop("Id", "string"),
      prop("Issuer", "string"),
      prop("IssuedAt", "DateTime?"),
      prop("NotBefore", "DateTime?"),
      prop("Subject", "string"),
      prop("Type", "string"),
    ],
  },
  BasicAuthCredentials: { members: [prop("Password", "string"), prop("UserId", "string")] },
  object: { members: [method("ToString", "", "string"), method("Equals", "obj: object", "bool")] },
  string: {
    members: [
      prop("Length", "int"),
      method("Contains", "value: string", "bool"),
      method("StartsWith", "value: string", "bool"),
      method("EndsWith", "value: string", "bool"),
      method("Equals", "value: string, comparisonType: StringComparison", "bool"),
      method("IndexOf", "value: string", "int"),
      method("LastIndexOf", "value: string", "int"),
      method("Substring", "startIndex: int, length: int", "string"),
      method("Split", "separator: char", "string[]"),
      method("Replace", "oldValue: string, newValue: string", "string"),
      method("ToLower", "", "string"),
      method("ToUpper", "", "string"),
      method("ToLowerInvariant", "", "string"),
      method("ToUpperInvariant", "", "string"),
      method("Trim", "", "string"),
      method("TrimStart", "", "string"),
      method("TrimEnd", "", "string"),
      method("PadLeft", "totalWidth: int", "string"),
      method("PadRight", "totalWidth: int", "string"),
      method("Insert", "startIndex: int, value: string", "string"),
      method("Remove", "startIndex: int", "string"),
      // APIM extension methods.
      method("AsBasic", "", "BasicAuthCredentials", "Parses an HTTP Basic Authorization header value; null if it isn't valid."),
      method("TryParseBasic", "result: out BasicAuthCredentials", "bool", "Tries to parse an HTTP Basic Authorization header value.", {
        args: "out var ${1:credentials}",
      }),
      method("AsJwt", "", "Jwt", "Parses a JWT; null if it isn't valid."),
      method("TryParseJwt", "result: out Jwt", "bool", "Tries to parse a JWT.", { args: "out var ${1:jwt}" }),
    ],
  },
  "byte[]": {
    members: [
      method("Encrypt", "alg: string, key: byte[], iv: byte[]", "byte[]", "Encrypts plaintext with a symmetric algorithm (APIM extension)."),
      method("Decrypt", "alg: string, key: byte[], iv: byte[]", "byte[]", "Decrypts cypher text with a symmetric algorithm (APIM extension)."),
    ],
  },
  X509Certificate2: {
    members: [
      prop("Subject", "string"),
      prop("Issuer", "string"),
      prop("Thumbprint", "string"),
      prop("SerialNumber", "string"),
      prop("NotBefore", "DateTime"),
      prop("NotAfter", "DateTime"),
      prop("SubjectName", "X500DistinguishedName"),
      prop("IssuerName", "X500DistinguishedName"),
      method("Verify", "", "bool"),
      method("VerifyNoRevocation", "", "bool", "Performs X.509 chain validation without checking revocation status (APIM extension)."),
    ],
  },
  X500DistinguishedName: { members: [prop("Name", "string")] },
  StringBuilder: {
    members: [
      prop("Length", "int"),
      method("Append", "value: object", "StringBuilder"),
      method("AppendLine", "value: string", "StringBuilder"),
      method("Insert", "index: int, value: string", "StringBuilder"),
      method("Replace", "oldValue: string, newValue: string", "StringBuilder"),
      method("Remove", "startIndex: int, length: int", "StringBuilder"),
      method("Clear", "", "StringBuilder"),
      method("ToString", "", "string"),
    ],
  },
  DateTimeOffset: {
    members: [
      ...["Days", "Hours", "Milliseconds", "Minutes", "Months", "Seconds", "Years"].map((unit) => method(`Add${unit}`, "value: double", "DateTimeOffset")),
      prop("DateTime", "DateTime"),
      prop("UtcDateTime", "DateTime"),
      prop("Offset", "TimeSpan"),
      method("ToUnixTimeSeconds", "", "long"),
      method("ToUnixTimeMilliseconds", "", "long"),
      method("ToString", "format: string", "string"),
    ],
  },
  Random: { members: [method("Next", "maxValue: int", "int"), method("NextDouble", "", "double")] },
  StringReader: { members: [method("Read", "", "int"), method("ReadLine", "", "string"), method("ReadToEnd", "", "string"), method("Peek", "", "int")] },
  StringWriter: { members: [method("Write", "value: string", "void"), method("WriteLine", "value: string", "void"), method("ToString", "", "string")] },
  XNode: { members: [method("ToString", "", "string"), method("Remove", "", "void"), prop("Parent", "XElement")] },
  XContainer: {
    base: ["XNode"],
    members: [
      method("Descendants", "name: XName", "IEnumerable<XElement>"),
      method("Elements", "name: XName", "IEnumerable<XElement>"),
      method("Element", "name: XName", "XElement"),
      method("Nodes", "", "IEnumerable<XNode>"),
      method("Add", "content: object", "void"),
    ],
  },
  XElement: {
    base: ["XContainer"],
    members: [
      prop("Name", "XName"),
      prop("Value", "string"),
      method("Attribute", "name: XName", "XAttribute"),
      method("Attributes", "", "IEnumerable<XAttribute>"),
      method("SetAttributeValue", "name: XName, value: object", "void"),
      method("SetValue", "value: object", "void"),
    ],
  },
  XDocument: { base: ["XContainer"], members: [prop("Root", "XElement"), prop("Declaration", "XDeclaration")] },
  XAttribute: { members: [prop("Name", "XName"), prop("Value", "string"), method("Remove", "", "void")] },
  XName: { members: [prop("LocalName", "string"), prop("NamespaceName", "string")] },
  HashAlgorithm: { members: [method("ComputeHash", "buffer: byte[]", "byte[]"), method("Dispose", "", "void")] },
  ...Object.fromEntries(["HMACSHA256", "HMACSHA1", "HMACSHA384", "HMACSHA512", "HMACMD5", "SHA256", "SHA1", "SHA384", "SHA512", "MD5"].map((name) => [name, { base: ["HashAlgorithm"], members: [] }])),
  DateTime: {
    members: [
      method("Add", "value: TimeSpan", "DateTime"),
      ...["Days", "Hours", "Milliseconds", "Minutes", "Months", "Seconds", "Ticks", "Years"].map((unit) =>
        method(`Add${unit}`, "value: double", "DateTime"),
      ),
      prop("Date", "DateTime"),
      prop("Day", "int"),
      prop("DayOfWeek", "DayOfWeek"),
      prop("DayOfYear", "int"),
      prop("Hour", "int"),
      method("IsDaylightSavingTime", "", "bool"),
      prop("Millisecond", "int"),
      prop("Minute", "int"),
      prop("Month", "int"),
      prop("Second", "int"),
      method("Subtract", "value: DateTime", "TimeSpan"),
      prop("Ticks", "long"),
      prop("TimeOfDay", "TimeSpan"),
      method("ToString", "format: string", "string"),
    ],
  },
  TimeSpan: {
    members: [
      ...["Days", "Hours", "Milliseconds", "Minutes", "Seconds"].map((unit) => prop(unit, "int")),
      ...["TotalDays", "TotalHours", "TotalMilliseconds", "TotalMinutes", "TotalSeconds"].map((unit) => prop(unit, "double")),
      prop("Ticks", "long"),
    ],
  },
  Guid: { members: [method("ToString", "format: string", "string")] },
  JToken: {
    members: [
      prop("Type", "JTokenType"),
      prop("HasValues", "bool"),
      prop("Parent", "JContainer"),
      prop("Path", "string"),
      prop("Root", "JToken"),
      method("Value", "key: object", "T", "Gets the value of the child with this key, converted to T.", {
        typeArgs: ["string", "int", "bool", "double", "long", "DateTime"],
        args: '"${2:key}"',
      }),
      method("Values", "", "IEnumerable<T>", undefined, { typeArgs: ["string", "int", "bool", "JToken"], args: "" }),
      method("SelectToken", "path: string", "JToken", "Selects a token by JSONPath; null if none matches."),
      method("SelectTokens", "path: string", "IEnumerable<JToken>"),
      method("ToObject", "", "T", undefined, { typeArgs: ["string", "int", "bool", "JObject", "JArray"], args: "" }),
      method("Children", "", "IEnumerable<JToken>"),
      method("DeepClone", "", "JToken"),
      method("Remove", "", "void"),
      method("Replace", "value: JToken", "void"),
      method("ToString", "formatting: Formatting", "string"),
    ],
    indexer: "JToken",
  },
  JContainer: { base: ["JToken"], members: [prop("Count", "int"), method("Add", "content: object", "void")] },
  JObject: {
    base: ["JContainer"],
    members: [
      method("Property", "name: string", "JProperty"),
      method("Properties", "", "IEnumerable<JProperty>"),
      method("ContainsKey", "propertyName: string", "bool"),
      method("TryGetValue", "propertyName: string, value: out JToken", "bool"),
      method("Add", "propertyName: string, value: JToken", "void"),
      method("Remove", "propertyName: string", "bool"),
    ],
    indexer: "JToken",
  },
  JArray: {
    base: ["JContainer", "IEnumerable<JToken>"],
    members: [method("Insert", "index: int, item: JToken", "void"), method("IndexOf", "item: JToken", "int"), method("Clear", "", "void")],
    indexer: "JToken",
  },
  JProperty: { base: ["JContainer"], members: [prop("Name", "string"), prop("Value", "JToken")] },
  JValue: { base: ["JToken"], members: [prop("Value", "object")] },
  Encoding: { members: [method("GetBytes", "s: string", "byte[]"), method("GetString", "bytes: byte[]", "string")] },
  Match: {
    base: ["Group"],
    members: [prop("Groups", "GroupCollection"), method("Result", "replacement: string", "string")],
  },
  Group: { base: ["Capture"], members: [prop("Captures", "CaptureCollection"), prop("Success", "bool")] },
  Capture: { members: [prop("Index", "int"), prop("Length", "int"), prop("Value", "string")] },
  GroupCollection: { members: [prop("Count", "int")], indexer: "Group" },
  CaptureCollection: { members: [prop("Count", "int")], indexer: "Capture" },
  Uri: {
    members: [
      prop("AbsolutePath", "string"),
      prop("AbsoluteUri", "string"),
      prop("Host", "string"),
      prop("PathAndQuery", "string"),
      prop("Port", "int"),
      prop("Query", "string"),
      prop("Scheme", "string"),
      prop("Segments", "string[]"),
    ],
  },
};

/** Members of `E` collections (LINQ and friends). */
const ENUMERABLE: Member[] = [
  method("Any", "", "bool"),
  method("All", "predicate: Func<E, bool>", "bool"),
  method("Contains", "value: E", "bool"),
  method("Count", "", "int"),
  method("First", "", "E"),
  method("FirstOrDefault", "", "E"),
  method("Last", "", "E"),
  method("LastOrDefault", "", "E"),
  method("Single", "", "E"),
  method("SingleOrDefault", "", "E"),
  method("Where", "predicate: Func<E, bool>", "IEnumerable<E>"),
  method("Select", "selector: Func<E, TResult>", "IEnumerable<object>"),
  method("OrderBy", "keySelector: Func<E, TKey>", "IEnumerable<E>"),
  method("Skip", "count: int", "IEnumerable<E>"),
  method("Take", "count: int", "IEnumerable<E>"),
  method("Distinct", "", "IEnumerable<E>"),
  method("ToArray", "", "E[]"),
  method("ToList", "", "List<E>"),
];

const DICTIONARY: Member[] = [
  method("ContainsKey", "key: K", "bool"),
  method("TryGetValue", "key: K, value: out V", "bool"),
  prop("Keys", "IEnumerable<K>"),
  prop("Values", "IEnumerable<V>"),
  prop("Count", "int"),
];

// Enum types: their values as static members of the enum's own type.
function enums(values: Record<string, string[]>): Record<string, TypeDef> {
  return Object.fromEntries(Object.entries(values).map(([name, members]) => [name, { members: members.map((member) => prop(member, name)) }]));
}

/** Static members by type name, for `Type.Member` access. */
export const STATICS: Record<string, TypeDef> = {
  string: {
    members: [
      prop("Empty", "string"),
      method("IsNullOrEmpty", "value: string", "bool"),
      method("IsNullOrWhiteSpace", "value: string", "bool"),
      method("Join", "separator: string, values: IEnumerable<string>", "string"),
      method("Format", "format: string, args: object[]", "string"),
      method("Concat", "values: string[]", "string"),
      method("Equals", "a: string, b: string, comparisonType: StringComparison", "bool"),
      method("Compare", "a: string, b: string", "int"),
    ],
  },
  int: {
    members: [method("Parse", "s: string", "int"), method("TryParse", "s: string, result: out int", "bool"), prop("MaxValue", "int"), prop("MinValue", "int")],
  },
  long: { members: [method("Parse", "s: string", "long"), method("TryParse", "s: string, result: out long", "bool")] },
  double: { members: [method("Parse", "s: string", "double"), method("TryParse", "s: string, result: out double", "bool")] },
  bool: { members: [method("Parse", "value: string", "bool"), method("TryParse", "value: string, result: out bool", "bool")] },
  DateTime: {
    members: [
      prop("Now", "DateTime"),
      prop("UtcNow", "DateTime"),
      prop("Today", "DateTime"),
      prop("MinValue", "DateTime"),
      prop("MaxValue", "DateTime"),
      method("Parse", "s: string", "DateTime"),
      method("DaysInMonth", "year: int, month: int", "int"),
      method("IsLeapYear", "year: int", "bool"),
    ],
  },
  TimeSpan: {
    members: [
      prop("Zero", "TimeSpan"),
      ...["Days", "Hours", "Milliseconds", "Minutes", "Seconds"].map((unit) => method(`From${unit}`, "value: double", "TimeSpan")),
      method("Parse", "s: string", "TimeSpan"),
    ],
  },
  Guid: {
    members: [prop("Empty", "Guid"), method("NewGuid", "", "Guid"), method("Parse", "input: string", "Guid"), method("TryParse", "input: string, result: out Guid", "bool")],
  },
  Convert: {
    members: [
      method("ToBase64String", "inArray: byte[]", "string"),
      method("FromBase64String", "s: string", "byte[]"),
      method("ToInt32", "value: object", "int"),
      method("ToInt64", "value: object", "long"),
      method("ToDouble", "value: object", "double"),
      method("ToBoolean", "value: object", "bool"),
      method("ToDateTime", "value: object", "DateTime"),
      method("ToString", "value: object", "string"),
    ],
  },
  Encoding: { members: [prop("UTF8", "Encoding"), prop("ASCII", "Encoding"), prop("Unicode", "Encoding")] },
  Math: {
    members: ["Abs", "Ceiling", "Floor", "Max", "Min", "Pow", "Round"].map((name) => method(name, "value: double", "double")),
  },
  Regex: {
    members: [
      method("IsMatch", "input: string, pattern: string", "bool"),
      method("Match", "input: string, pattern: string", "Match"),
      method("Matches", "input: string, pattern: string", "IEnumerable<Match>"),
      method("Replace", "input: string, pattern: string, replacement: string", "string"),
      method("Split", "input: string, pattern: string", "string[]"),
      method("Unescape", "str: string", "string"),
    ],
  },
  JsonConvert: {
    members: [
      method("SerializeObject", "value: object", "string"),
      method("DeserializeObject", "value: string", "T", undefined, { typeArgs: ["JObject", "JArray", "Dictionary<string, string>"], args: "$2" }),
    ],
  },
  JToken: { members: [method("Parse", "json: string", "JToken"), method("FromObject", "o: object", "JToken")] },
  JObject: { members: [method("Parse", "json: string", "JObject"), method("FromObject", "o: object", "JObject")] },
  JArray: { members: [method("Parse", "json: string", "JArray"), method("FromObject", "o: object", "JArray")] },
  Uri: { members: [method("EscapeDataString", "stringToEscape: string", "string"), method("UnescapeDataString", "stringToUnescape: string", "string")] },
  DateTimeOffset: {
    members: [
      prop("Now", "DateTimeOffset"),
      prop("UtcNow", "DateTimeOffset"),
      method("FromUnixTimeSeconds", "seconds: long", "DateTimeOffset"),
      method("FromUnixTimeMilliseconds", "milliseconds: long", "DateTimeOffset"),
      method("Parse", "input: string", "DateTimeOffset"),
    ],
  },
  XDocument: { members: [method("Parse", "text: string", "XDocument")] },
  XElement: { members: [method("Parse", "text: string", "XElement")] },
  BitConverter: { members: [method("ToString", "value: byte[]", "string", "Hex string of the bytes, e.g. 0A-1B-2C.")] },
  ...Object.fromEntries(
    ["SHA256", "SHA1", "SHA384", "SHA512", "MD5"].map((name) => [name, { members: [method("Create", "", name)] }]),
  ),
  ...enums({
    JTokenType: ["None", "Object", "Array", "Constructor", "Property", "Comment", "Integer", "Float", "String", "Boolean", "Null", "Undefined", "Date", "Raw", "Bytes", "Guid", "Uri", "TimeSpan"],
    Formatting: ["None", "Indented"],
    StringComparison: ["CurrentCulture", "CurrentCultureIgnoreCase", "InvariantCulture", "InvariantCultureIgnoreCase", "Ordinal", "OrdinalIgnoreCase"],
    StringSplitOptions: ["None", "RemoveEmptyEntries", "TrimEntries"],
    DateTimeKind: ["Utc"],
    MidpointRounding: ["ToEven", "AwayFromZero", "ToZero", "ToNegativeInfinity", "ToPositiveInfinity"],
    RegexOptions: ["None", "IgnoreCase", "Multiline", "ExplicitCapture", "Compiled", "Singleline", "IgnorePatternWhitespace", "RightToLeft", "CultureInvariant"],
    UriPartial: ["Scheme", "Authority", "Path", "Query"],
    XmlNodeType: ["Element", "Attribute", "Text", "CDATA", "Comment", "Document", "Whitespace"],
  }),
  WebUtility: {
    members: ["UrlEncode", "UrlDecode", "HtmlEncode", "HtmlDecode"].map((name) => method(name, "value: string", "string")),
  },
};

const ALIASES: Record<string, string> = { String: "string", Int32: "int", Int64: "long", Double: "double", Boolean: "bool", Object: "object" };

/** Canonical name for a type keyword or alias, e.g. `Int32` -> `int`. */
export const canonicalType = (name: string) => ALIASES[name] ?? name;

/** Splits `Name<A, B<C>>` into `Name` and its top-level type arguments. */
export function parseGeneric(type: string): { name: string; args: string[] } {
  const open = type.indexOf("<");
  if (open < 0 || !type.endsWith(">")) return { name: type, args: [] };
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = start; i < type.length - 1; i++) {
    const c = type[i];
    if (c === "<") depth++;
    else if (c === ">") depth--;
    else if (c === "," && depth === 0) {
      args.push(type.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(type.slice(start, type.length - 1).trim());
  return { name: type.slice(0, open), args };
}

const substitute = (type: string, bindings: Record<string, string>) =>
  type.replace(/\b[EKV]\b/g, (placeholder) => bindings[placeholder] ?? placeholder);

const bind = (members: Member[], bindings: Record<string, string>) =>
  members.map((member) => ({ ...member, type: substitute(member.type, bindings) }));

const COLLECTIONS = new Set(["IEnumerable", "ICollection", "IList", "List", "IReadOnlyCollection", "IReadOnlyList", "HashSet", "ISet"]);
const DICTIONARIES = new Set(["IReadOnlyDictionary", "IDictionary", "Dictionary"]);

/** Instance members and indexer result of a type, including inherited ones. */
export function membersOf(type: string): { members: Member[]; indexer?: string } {
  if (type.endsWith("?")) {
    const inner = membersOf(type.slice(0, -1));
    return { members: [prop("HasValue", "bool"), prop("Value", type.slice(0, -1)), ...inner.members] };
  }
  if (type.endsWith("[]") && !TYPES[type]) {
    const element = type.slice(0, -2);
    return { members: [prop("Length", "int"), ...bind(ENUMERABLE, { E: element }), ...TYPES.object!.members], indexer: element };
  }
  const { name, args } = parseGeneric(type);
  if (COLLECTIONS.has(name) && args.length === 1) {
    const counted = name === "IEnumerable" ? [] : [prop("Count", "int")];
    const indexer = name.includes("List") ? { indexer: args[0]! } : {};
    return { members: [...counted, ...bind(ENUMERABLE, { E: args[0]! })], ...indexer };
  }
  if (DICTIONARIES.has(name) && args.length === 2) {
    return { members: bind(DICTIONARY, { K: args[0]!, V: args[1]! }), indexer: args[1]! };
  }
  const def = TYPES[canonicalType(type)] ?? { members: [] };
  const inherited = (def.base ?? (type === "object" ? [] : ["object"])).map(membersOf);
  const seen = new Set(def.members.map((member) => member.name));
  const members = [...def.members];
  for (const base of inherited) {
    for (const member of base.members) {
      if (!seen.has(member.name)) {
        seen.add(member.name);
        members.push(member);
      }
    }
  }
  const indexer = def.indexer ?? inherited.find((base) => base.indexer)?.indexer;
  return { members, ...(indexer && { indexer }) };
}

/** Types the gateway allows in expressions (fully qualified, from the reference). */
export const ALLOWED_TYPES = [
  "Newtonsoft.Json.Formatting",
  "Newtonsoft.Json.JsonConvert",
  "Newtonsoft.Json.Linq.Extensions",
  "Newtonsoft.Json.Linq.JArray",
  "Newtonsoft.Json.Linq.JConstructor",
  "Newtonsoft.Json.Linq.JContainer",
  "Newtonsoft.Json.Linq.JObject",
  "Newtonsoft.Json.Linq.JProperty",
  "Newtonsoft.Json.Linq.JRaw",
  "Newtonsoft.Json.Linq.JToken",
  "Newtonsoft.Json.Linq.JTokenType",
  "Newtonsoft.Json.Linq.JValue",
  "System.Array",
  "System.BitConverter",
  "System.Boolean",
  "System.Byte",
  "System.Char",
  "System.Collections.Generic.Dictionary<TKey, TValue>",
  "System.Collections.Generic.HashSet<T>",
  "System.Collections.Generic.ICollection<T>",
  "System.Collections.Generic.IDictionary<TKey, TValue>",
  "System.Collections.Generic.IEnumerable<T>",
  "System.Collections.Generic.IEnumerator<T>",
  "System.Collections.Generic.IList<T>",
  "System.Collections.Generic.IReadOnlyCollection<T>",
  "System.Collections.Generic.IReadOnlyDictionary<TKey, TValue>",
  "System.Collections.Generic.ISet<T>",
  "System.Collections.Generic.KeyValuePair<TKey, TValue>",
  "System.Collections.Generic.List<T>",
  "System.Collections.Generic.Queue<T>",
  "System.Collections.Generic.Stack<T>",
  "System.Convert",
  "System.DateTime",
  "System.DateTimeKind",
  "System.DateTimeOffset",
  "System.Decimal",
  "System.Double",
  "System.Enum",
  "System.Exception",
  "System.Guid",
  "System.Int16",
  "System.Int32",
  "System.Int64",
  "System.IO.StringReader",
  "System.IO.StringWriter",
  "System.Linq.Enumerable",
  "System.Math",
  "System.MidpointRounding",
  "System.Net.IPAddress",
  "System.Net.WebUtility",
  "System.Nullable",
  "System.Random",
  "System.SByte",
  "System.Security.Cryptography.AsymmetricAlgorithm",
  "System.Security.Cryptography.CipherMode",
  "System.Security.Cryptography.HashAlgorithm",
  "System.Security.Cryptography.HashAlgorithmName",
  "System.Security.Cryptography.HMAC",
  "System.Security.Cryptography.HMACMD5",
  "System.Security.Cryptography.HMACSHA1",
  "System.Security.Cryptography.HMACSHA256",
  "System.Security.Cryptography.HMACSHA384",
  "System.Security.Cryptography.HMACSHA512",
  "System.Security.Cryptography.KeyedHashAlgorithm",
  "System.Security.Cryptography.MD5",
  "System.Security.Cryptography.Oid",
  "System.Security.Cryptography.PaddingMode",
  "System.Security.Cryptography.RNGCryptoServiceProvider",
  "System.Security.Cryptography.RSA",
  "System.Security.Cryptography.RSAEncryptionPadding",
  "System.Security.Cryptography.RSASignaturePadding",
  "System.Security.Cryptography.SHA1",
  "System.Security.Cryptography.SHA1Managed",
  "System.Security.Cryptography.SHA256",
  "System.Security.Cryptography.SHA256Managed",
  "System.Security.Cryptography.SHA384",
  "System.Security.Cryptography.SHA384Managed",
  "System.Security.Cryptography.SHA512",
  "System.Security.Cryptography.SHA512Managed",
  "System.Security.Cryptography.SymmetricAlgorithm",
  "System.Security.Cryptography.X509Certificates.PublicKey",
  "System.Security.Cryptography.X509Certificates.RSACertificateExtensions",
  "System.Security.Cryptography.X509Certificates.X500DistinguishedName",
  "System.Security.Cryptography.X509Certificates.X509Certificate",
  "System.Security.Cryptography.X509Certificates.X509Certificate2",
  "System.Security.Cryptography.X509Certificates.X509ContentType",
  "System.Security.Cryptography.X509Certificates.X509NameType",
  "System.Single",
  "System.String",
  "System.StringComparer",
  "System.StringComparison",
  "System.StringSplitOptions",
  "System.Text.Encoding",
  "System.Text.RegularExpressions.Capture",
  "System.Text.RegularExpressions.CaptureCollection",
  "System.Text.RegularExpressions.Group",
  "System.Text.RegularExpressions.GroupCollection",
  "System.Text.RegularExpressions.Match",
  "System.Text.RegularExpressions.Regex",
  "System.Text.RegularExpressions.RegexOptions",
  "System.Text.StringBuilder",
  "System.TimeSpan",
  "System.TimeZone",
  "System.TimeZoneInfo.AdjustmentRule",
  "System.TimeZoneInfo.TransitionTime",
  "System.TimeZoneInfo",
  "System.Tuple",
  "System.UInt16",
  "System.UInt32",
  "System.UInt64",
  "System.Uri",
  "System.UriPartial",
  "System.Xml.Linq.Extensions",
  "System.Xml.Linq.XAttribute",
  "System.Xml.Linq.XCData",
  "System.Xml.Linq.XComment",
  "System.Xml.Linq.XContainer",
  "System.Xml.Linq.XDeclaration",
  "System.Xml.Linq.XDocument",
  "System.Xml.Linq.XDocumentType",
  "System.Xml.Linq.XElement",
  "System.Xml.Linq.XName",
  "System.Xml.Linq.XNamespace",
  "System.Xml.Linq.XNode",
  "System.Xml.Linq.XNodeDocumentOrderComparer",
  "System.Xml.Linq.XNodeEqualityComparer",
  "System.Xml.Linq.XObject",
  "System.Xml.Linq.XProcessingInstruction",
  "System.Xml.Linq.XText",
  "System.Xml.XmlNodeType",
];

export const KEYWORDS = [
  "as", "bool", "break", "case", "default", "double", "else", "false", "foreach", "if", "in", "int", "is", "long",
  "new", "null", "object", "out", "return", "string", "switch", "throw", "true", "typeof", "var",
];
