import { ChangeDetectionStrategy, Component, OnInit, AfterViewInit } from '@angular/core';
import { Observable } from 'rxjs';

import { ProductContextFacade } from 'ish-core/facades/product-context.facade';
import { ProductView } from 'ish-core/models/product-view/product-view.model';
import * as JsBarcode from 'jsbarcode';
@Component({
  selector: 'ish-product-detail',
  templateUrl: './product-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailComponent implements OnInit,AfterViewInit {
  product$: Observable<ProductView>;
  sku: string=''
  constructor(
    private context: ProductContextFacade
    ) {}

  ngOnInit() {
    this.product$ = this.context.select('product');
    this.product$.subscribe(val => {
      this.sku = val.sku;
    })
  }

  ngAfterViewInit(){
    JsBarcode("#code128", this.sku);
  }
}
