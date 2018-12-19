
const generateKeys = (useLocalStorage) => {
	for(let i=1; i<=3; i++) {
		const mnemonic = (useLocalStorage ? localStorage.getItem('mnemonic'+i) : null) || bip39.generateMnemonic();
		const seed = bip39.mnemonicToSeed(mnemonic);
		const xprv = bitcoin.bip32.fromSeed(seed, bitcoin.networks.testnet);
		localStorage.setItem('mnemonic'+i, mnemonic);
		$('#mnemonic'+i).val(mnemonic);
		if(i<3) $('#sign-mnemonic'+i).val(mnemonic);
		$('#extpubkey'+i).val(xprv.neutered().toBase58());
	}
};

const generatePayment = (orderId) => {
	const extpubkeys = [$('#extpubkey1').val(), $('#extpubkey2').val(), $('#extpubkey3').val()];
	const pubkeys = extpubkeys.map((tpub) => bitcoin.bip32.fromBase58(tpub, bitcoin.networks.testnet).derive(orderId).publicKey);
	return bitcoin.payments.p2sh({
		network: bitcoin.networks.testnet,
		redeem: bitcoin.payments.p2wsh({
			network: bitcoin.networks.testnet,
			redeem: bitcoin.payments.p2ms({
				network: bitcoin.networks.testnet,
				m:2,
				pubkeys,
			}),
		}),
	});
};

const getOrderId = () => +$('#order-id').val();

const getAddress = () => generatePayment(getOrderId()).address;

const generateAddress = () => {
	const address = getAddress();
	$('#qr-code').attr('src', 'https://chart.apis.google.com/chart?chs=500x500&cht=qr&chl='+address);
	$('#payment-address').val(address);
	$('#balance-api').val('https://chain.so/api/v2/get_address_received/BTCTEST/'+address);
};

const checkReceived = () => {
	const address = getAddress();
	$.getJSON('https://chain.so/api/v2/get_address_received/BTCTEST/'+address, (json) => {
		$('#address-balance').html(JSON.stringify(json, null, '  '));
	});
};

const createWithdrawTx = () => {
	const orderId = getOrderId();
	const mnemonics = [$('#sign-mnemonic1').val(), $('#sign-mnemonic2').val()];
	const privateKeys = mnemonics.map((mnemonic) =>
		bitcoin.ECPair.fromPrivateKey(
			bitcoin.bip32.fromSeed(bip39.mnemonicToSeed(mnemonic), bitcoin.networks.testnet).derive(orderId).privateKey,
			{ network: bitcoin.networks.testnet }
		));
	const payment = generatePayment(orderId);
	$.getJSON('https://chain.so/api/v2/get_tx_unspent/BTCTEST/'+payment.address, (json) => {
		json.data.txs = json.data.txs.map((tx) => {tx.value=Math.floor(100000000*tx.value); return tx});
		let balance = json.data.txs.reduce((a, b) => a+b.value, 0);
		const txb = new bitcoin.TransactionBuilder(bitcoin.networks.testnet);
		for(let utxo of json.data.txs) {
			txb.addInput(utxo.txid, utxo.output_no, null, payment.output);
		}
		txb.addOutput($('#receive-address').val(), balance - 10000);
		for(let i in json.data.txs) {
			for(let j=0; j<2; j++) {
				txb.sign(+i, privateKeys[j], payment.redeem.output, null, json.data.txs[i].value, payment.redeem.redeem.output);
			}
		}
		const tx = txb.build();
		$('#withdraw-tx').html(tx.toHex());
		$('#broadcast-tx').val(tx.toHex());
	});
};

const broadcastTx = () => {
	const rawtx = $('#broadcast-tx').val();
	$.post('https://chain.so/api/v2/send_tx/BTCTEST', {tx_hex: rawtx}, (json) => {
		$('#tx-broadcasted').html(JSON.stringify(json, null, '  '));
	});
};

$(document).ready(() => {
	generateKeys(true);
	generateAddress();
	checkReceived();
});

