import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';

import { Address } from '../../../models/address/address.model';
import { User } from '../../../models/user/user.model';

/**
 * The Account Address Page Component displays the preferred InvoiceTo and ShipTo addresses of the user
 * and any further addresses.
 * see also: {@link AccountAddressPageContainerComponent}
 *
 */
@Component({
  selector: 'ish-account-addresses-page',
  templateUrl: './account-addresses-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountAddressesPageComponent implements OnChanges {
  @Input()
  addresses: Address[];
  @Input()
  user: User;

  furtherAddresses: Address[] = [];

  hasPreferredAddresses = false;
  preferredAddressesEqual: boolean;

  /*
    on changes - update the shown further addresses
  */
  ngOnChanges() {
    // all addresses of the user except the preferred invoiceTo and shipTo addresses
    this.furtherAddresses = this.addresses.filter(
      (address: Address) =>
        (!this.user.preferredInvoiceToAddress || address.id !== this.user.preferredInvoiceToAddress.id) &&
        (!this.user.preferredShipToAddress || address.id !== this.user.preferredShipToAddress.id)
    );

    if (this.user.preferredInvoiceToAddress || this.user.preferredShipToAddress) {
      this.hasPreferredAddresses = true;
    }

    this.preferredAddressesEqual =
      this.user.preferredInvoiceToAddress &&
      this.user.preferredShipToAddress &&
      this.user.preferredInvoiceToAddress.id === this.user.preferredShipToAddress.id;
  }
}