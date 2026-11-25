export interface Action {group:string;index:number;label:string;sound:string;caption:string}
export interface Entry {id:string;name:string;english:string;game:string;edition:string;manifest:string;modern:boolean;actions:Action[]}
