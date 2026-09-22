import { IsIn } from "class-validator";

export class ReportCustomerUnavailableDto {
  @IsIn(["customer_not_home", "customer_not_answering"])
  outcome!: "customer_not_home" | "customer_not_answering";
}
