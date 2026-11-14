/** Only presentation checks. The server enforces expiry, one-time use, recipient, throttle and authorization. */
export type JoinCodeKind="short"|"targeted";
export function joinCodeKind(value:string):JoinCodeKind|null {
 const raw=value.trim();
 if(/^[a-z0-9]{4}-?[a-z0-9]{4}$/i.test(raw))return "short";
 if(/^v1\.[A-Za-z0-9_-]{20,128}$/i.test(raw))return "targeted";
 return null;
}
