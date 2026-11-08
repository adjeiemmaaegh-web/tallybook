export declare const GHANA_TIME_ZONE: "Africa/Accra";
export declare function businessTimeZone(country?: string): string | undefined;
export declare function businessDayKey(value: Date | string | number, country?: string): string;
export declare function businessDayStart(value: Date | string | number, country?: string): Date;
export declare function shiftBusinessDay(value: Date | string | number, days: number, country?: string): Date;
export declare function businessDayEnd(value: Date | string | number, country?: string): Date;
export declare function businessDateLabel(value: Date | string | number, country?: string): string;
export declare function businessWeekdayLabel(value: Date | string | number, country?: string): string;
export declare function businessDateTimeLabel(value: Date | string | number, country?: string): string;
