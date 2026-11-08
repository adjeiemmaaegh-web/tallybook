export interface CategoryHierarchyRow{id:string;businessProfileId:string;name:string;parentCategoryId?:string}
export declare function validateCategoryHierarchy(categories:CategoryHierarchyRow[],companyId:string,maxDepth?:number):{
 depths:Map<string,number>;labels:Map<string,string>
};
