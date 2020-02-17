<template>
	<view :class="['businessInfoW', {'ap-filter': !loaded}]">





		<!-- 申请按钮 -->
		<view class="btn">
			<button :class="{active: getCanApply}" :disabled="!getCanApply" :open-type="hasAuth === 'N' ? 'getUserInfo' : ''" @getuserinfo="getUserInfo" @tap="applyPay">{{ getCurrentBtnText }}</button>
		</view>
		
		<!-- 弹窗 -->
		<mask class="discountRemindPop" :show="discountPop" @close="discountPop = false">
			<view class="close">
				<view>
					<close @close="discountPop = false"></close>
				</view>
			</view>
			<view class="remind">
				<image :src="remindPic"></image>
				<view class="content">
					<view class="title">首单优惠说明</view>
					<view class="middle">
						<view>您的首单可获得10元现金补贴优惠，仅限用于本单的首款支付(全额支付不可用）；</view>
						<view>当首付不足10元，至少需付0.01元时，则剩余金额失效不可作其他抵扣；</view>
						<view>同一真实用户最多可享一次优惠机会；</view>
						<view>添加我们的客服ocard999可获得最新优惠信息。</view>
					</view>
					<view class="foot">本活动最终解释权归上海新瓴拓科技公司所有</view>
				</view>

			</view>
		</mask>

		<!-- 商品照片，描述弹窗 -->
		<mask :show="goodsPop" @close="goodsPop = false">
			<swiper-pop :price="price" :goodsName="goodsName" :description="description" :goodsPicList="imageUrlList"/>
			<view class="close">
				<view>
					<close @close="goodsPop = false"></close>
				</view>
			</view>
		</mask>
	</view>
</template>

<script>
	import { wxAuth, wxPay, wxConfirm } from '../../common/wxFuns.js'
	import { getQueryString, VERSION, storage, debounce, setRiskManagementInfo, setRiskInfo, BUYER_ORDER_LIST, GOODS_INFO, PLANS, LOGIN, REGISTER, USER_STATUS, CREATE_ORDER, MERCHANT_PAYMENT_CODE, WHERE_FROM, FROM_ONLINE } from '../../common'
	import { FirstRiskStatus } from './constants.js';
	import { MerchantInfo } from './components/merchantInfo.vue'
	import { GoodsInfo } from './components/goodsInfo.vue'
	import { SwiperPop } from './components/swiperPop.vue'
	export default {
		components: {
			MerchantInfo,
			GoodsInfo,
			SwiperPop,
		},
		
		data() {
			return {
				loaded: false,
				hasAuth: 'N', //是否登陆成功
				hasCoupon: 'N', //是否首单减免
				idCardStatus: '', //实名认证状态 INIT-初始化 SUC-成功 FAIL-失败
				bankCardStatus: '', //卡号验证状态
				riskStatus: '', //第一次风控状态
				
				merchantPaymentCode: '',
				merchantId: '',
				nickName: '', //昵称
				realName: '', //真实姓名
				mobile: '', //手机号
				avatarUrl: '', //头像地址
				goodsName: '', //商品名称
				price: '', //商品价格
				description: '',//商品描述
				firstImageUrl: '',//第一张图片地址
				imageUrlList: [],//所有图片地址
				plans: [] ,//支付方式
				payType: '', //当前支付方式
				allPay: 'N', //是否为全额支付
				agreement: true, //我同意
				
				// goodsPic: `${this.$ossStaticFile}${this.$ossStaticDirectories}goods.png`,
				goodsPop: false, //商品信息弹窗
				// goodsPicList: [`${this.$ossStaticFile}${this.$ossStaticDirectories}goods.png`, `${this.$ossStaticFile}${this.$ossStaticDirectories}goods.png`], //商品照片数组			
				discountPop: false, //满减弹窗
				remindPic: `${this.$ossStaticFile}${this.$ossStaticDirectories}remind.png`
			}
		},
		
		computed: {
			
			getCanApply() {
				if (this.payType && this.agreement) {
					return true;
				} else {
					return false;
				}
			},
			
			//申请或者注册文案
			getCurrentBtnText() {
				let str = '';
				if (this.hasAuth === 'N') {
					// 未登陆
					str = '申请注册'; //走授权，走审核
				} else {
					// 登陆
					if (this.riskStatus !== FirstRiskStatus.SUC) {
						str = '申请注册'; //不走授权, 走审核
					} 
					if (this.riskStatus === FirstRiskStatus.SUC && this.allPay === 'N') {
						str = '申请支付'; // 走下单风控
					}
					if (this.riskStatus === FirstRiskStatus.SUC && this.allPay === 'Y') {
						str = `确认支付${this.price}元`; //走下单全额付款
					}
				}
				return str;
			}
		},
		
		methods: {
			//支付
			pay: debounce(function(orderId, installmentIds, transAmt) {
				wxPay({
					amount: transAmt,
					payIds: installmentIds,
					orderId: orderId
				}).then(res => {
					uni.switchTab({ url: '/pages/home/index'})
				})
			}, 500),

			//下单
			createOrder(callback) {
				this.$http.post('/order/buyer/createOnVersion', {
					version: VERSION,
					merchantId: this.merchantId,
					merchantPaymentCode: this.merchantPaymentCode,
					goodsName: this.goodsName,
					relateOrderNo: '',
					price: this.price,
					ruleId: this.payType
				}).then(res => {
					const { orderId, installmentIds, transAmt } = res;
					callback(orderId, installmentIds, transAmt);
				});
			},

			//已登陆按钮
			async applyPay() {
				if (this.hasAuth === 'Y') {
					const resOrderList = await this.$http.get(`${BUYER_ORDER_LIST}?merchantPaymentCode=${this.merchantPaymentCode}`);
					if (resOrderList && resOrderList.buyerConfirm && resOrderList.buyerConfirm.length > 0) {
						// 用户未付首款
						wxConfirm({content: '您有一笔待支付订单', cancelText: '取消', confirmText: '去查看'}).then(() => {
							uni.reLaunch({
								url: `/pages/order/detail?id=${resOrderList.buyerConfirm[0].orderId}`
							})
						})
						return;
					}
					if (resOrderList && resOrderList.riskProcess && resOrderList.riskProcess.length > 0) {
						//有审核中订单不再下单n
						const { orderId } = resOrderList.riskProcess[0];
						wxConfirm({content: '您有一笔审核中订单', cancelText: '取消', confirmText: '去查看'}).then(() => {
							uni.navigateTo({
								url: `/pages/auditing/index?online=Y&orderId=${orderId}&nickName=${this.nickName}&realName=${this.realName}&avatarUrl=${encodeURIComponent(this.avatarUrl)}&goodsName=${encodeURIComponent(this.goodsName)}&price=${this.price}&description=${encodeURIComponent(this.description)}&firstImageUrl=${encodeURIComponent(this.firstImageUrl)}&imageUrlList=${encodeURIComponent(JSON.stringify(this.imageUrlList))}`
							})
						})
						return;
					}

					if (this.allPay === 'Y') {
						/**
						 * 全额支付
						 */
						uni.showToast({
							icon: 'none',
							title: '选用全额支付，不可享受首单立减10元'
						});
						//下单
						this.createOrder((orderId, installmentIds, transAmt) => {
							this.pay(orderId, installmentIds[0], transAmt);
						});
					} else {
						/**
						 * 分期
						 */
						if (this.bankCardStatus === FirstRiskStatus.SUC && this.riskStatus !== FirstRiskStatus.SUC) {
							// 风控中，风控失败
							uni.navigateTo({
								url: `/pages/register/auditResult?riskStatus=${this.riskStatus}`
							})
							return;
						}
						if (this.idCardStatus !== FirstRiskStatus.SUC) {
							// 实名认证
							uni.navigateTo({
								url: '/pages/register/index'
							})
							return;
						}
						if (this.idCardStatus === FirstRiskStatus.SUC && this.bankCardStatus !== FirstRiskStatus.SUC) {
							// 绑定银行卡
							uni.navigateTo({
								url: '/pages/register/binding'
							})
							return;
						}
						if (this.riskStatus === FirstRiskStatus.SUC) {
							// 下单
							// 3=用户支付前，点击申请支付icon
							setRiskManagementInfo(3)
							
							this.createOrder((orderId, installmentIds, transAmt) => {
								//风控
								uni.navigateTo({
									url: `/pages/auditing/index?online=Y&orderId=${orderId}&nickName=${this.nickName}&realName=${this.realName}&avatarUrl=${encodeURIComponent(this.avatarUrl)}&goodsName=${encodeURIComponent(this.goodsName)}&price=${this.price}&description=${encodeURIComponent(this.description)}&firstImageUrl=${encodeURIComponent(this.firstImageUrl)}&imageUrlList=${encodeURIComponent(JSON.stringify(this.imageUrlList))}`
								})
							});
						}
					}
				}
			},
			
			// 未登陆按钮
			getUserInfo(e) {
				const merchantId = this.merchantId;
				const { userInfo, encryptedData, iv } = e.detail;
				if (userInfo) {
					wxAuth(REGISTER, {
						encryptedData: encryptedData,
						iv: iv,
						merchantId: merchantId
					}).then(res => {
						if (this.allPay === 'Y') {
							//全额支付
							this.createOrder((orderId, installmentIds, transAmt) => {
								uni.reLaunch({
									url: `/pages/order/detail?id=${orderId}`
								})
							})
						} else {
							//分期支付
							// 实名认证
							uni.navigateTo({
								url: '/pages/register/index'
							})
						}
					})
				}
			},
			
			// 查询登录状态
			wxLogin() {
				wxAuth(LOGIN, {}).then(async (res) => {
					// 这里可以判断用户是否已经有授权
					this.hasAuth = res.hasAuth;
					if (this.hasAuth === 'Y') {
						// 查询用户是否有订单
						const resOrderList = await this.$http.get(`${BUYER_ORDER_LIST}?merchantPaymentCode=${this.merchantPaymentCode}`);
						if (resOrderList && resOrderList.overdue && resOrderList.overdue.length > 0) {
							// 超时尾款订单
							uni.reLaunch({
								url: `/pages/dueUnpaid/index?listOverdue=${encodeURIComponent(JSON.stringify(resOrderList.overdue))}`
							})
							return;
						}
						if (resOrderList && resOrderList.buyerConfirm && resOrderList.buyerConfirm.length > 0) {
							// 用户未付首款
							uni.reLaunch({
								url: `/pages/order/detail?id=${resOrderList.buyerConfirm[0].orderId}`
							})
							return;
						}
						if (resOrderList && resOrderList.riskProcess && resOrderList.riskProcess.length > 0) {
							//有审核中订单不再下单
							const { orderId } = resOrderList.riskProcess[0];
							uni.reLaunch({
								url: `/pages/auditing/index?online=Y&orderId=${orderId}&nickName=${this.nickName}&realName=${this.realName}&avatarUrl=${encodeURIComponent(this.avatarUrl)}&goodsName=${encodeURIComponent(this.goodsName)}&price=${this.price}&description=${encodeURIComponent(this.description)}&firstImageUrl=${encodeURIComponent(this.firstImageUrl)}&imageUrlList=${encodeURIComponent(JSON.stringify(this.imageUrlList))}`
							})
							return;
						}
						

						//用户审核步骤
						const resStatus = await this.$http.get(USER_STATUS);
						if (resStatus && resStatus.account) {
							const { idCardStatus, bankCardStatus, riskStatus } = resStatus.account;
							this.idCardStatus = idCardStatus;
							this.bankCardStatus = bankCardStatus;
							this.riskStatus = riskStatus;
						}

						// 查询是否有首单减免
						this.$http.get('/order/buyer/hasCoupon').then(res => {
							this.hasCoupon = res.HAS_COUPON;
						})

					}
				}).finally(() => {
					this.loaded = true; // 加载完成
				})			
			},
			
			onSelectPayType(value, allPay) {
				this.payType = value;
				this.allPay = allPay;
			},
			
			// 注册协议
			onViewRegister() {
				let src = this.$ossStaticFile + 'contract/register.html'
				uni.navigateTo({
					url: `/pages/webview/index?src=${src}&title=注册协议`
				})
			},
			// 隐私政策
			onViewPrivacy() {
				let src = this.$ossStaticFile + 'contract/privacy.html'
				uni.navigateTo({
					url: `/pages/webview/index?src=${src}&title=隐私政策`
				})
			},
			
			// 格式化支付方式文案
			formatDesc(text, direction, allPay) {
				// 全额支付
				if (allPay === 'Y') {
					return text;
				}

				let result = '';
				if (text) {
					const index = text.indexOf('￥');
					if (direction === 'begin') {
						result = text.substring(0, index);
					}
					if (direction === 'end') {
						result = text.substring(index);
					}
				}
				return result;
			},

			//商品信息
			async queryMerchantGoodsInfo(comeinType) {
				const res = await this.$http.get(`${GOODS_INFO}?merchantPaymentCode=${this.merchantPaymentCode}`).catch(() => { this.loaded = true; });
				if (res) {
					const { isBanned, isValid, oneself, merchantPaymentCode, merchantId, nickName, realName, mobile, avatarUrl, goodsName, price, description, firstImageUrl, imageUrlList } = res;
					//商户违规
					if (isBanned === 'Y') {
						uni.reLaunch({
							url: '/pages/merchantError/index'
						})
					}
					if (isValid === 'N') {
						// 收款码失效
						uni.reLaunch({
							url: `/pages/invalidCode/index?nickName=${nickName}&avatarUrl=${encodeURIComponent(avatarUrl)}`
						})
						return;
					}
					if (oneself === 'Y') {
						//付款码和买家是同一个人
						uni.reLaunch({
							url: '/pages/payYourself/index'
						})
						return;
					}
					this.merchantId = merchantId;
					this.nickName = nickName;
					this.realName = realName;
					this.mobile = mobile;
					this.avatarUrl = avatarUrl;
					this.goodsName = goodsName;
					this.price = price;
					this.description = description;
					this.firstImageUrl = firstImageUrl;
					this.imageUrlList = imageUrlList;
				}
				
				// 获取分期支付方式
				const  res2 = await this.$http.post('/orderInstallment/getPlansByVersion', { 
					merchantPaymentCode: this.merchantPaymentCode, 
					version: VERSION,
					price: this.price 
				}).catch(() => { this.loaded = true; });
				if (res2) {
					const { plans } = res2;
					this.plans = plans;
					if (this.plans.length > 0) {
						// 默认选中第一个
						this.payType = this.plans[0].installmentRuleId.toString();
						this.allPay = this.plans[0].allPay;
					}
				}
				//登陆
				this.wxLogin();

				//风控信息，有token拿token
				if (comeinType === 'scan') {
					setRiskInfo(this.merchantPaymentCode, this.price, '21');
				}
				if (comeinType === 'share') {
					setRiskInfo(this.merchantPaymentCode, this.price, '11');
				}
			},
		},
		
		/**
		 * 小程序生命周期
		 */
		onShow() {

		},

		onLoad(opt) {
			// 1=点击收款码链接
			setRiskManagementInfo(1)
			let comeinType = '';
			// 二维码扫码进来
			const q = opt.q
			if(q) {
				console.log('扫码进来...', q);
				comeinType = 'scan';
				const code = getQueryString(decodeURIComponent(q), 'code')
				this.merchantPaymentCode = code;
			} else {
				// 我们自己小程序分享页面
				console.log('分享跳转进来...', opt);
				comeinType = 'share';
				const { merchantPaymentCode } = opt;
				this.merchantPaymentCode = merchantPaymentCode;
			}
			// this.plans = [{installmentRuleId: 12, desc: { REST_PAY: '尾款分3次(0服务费)￥80.00/次', DOWN_PAY: '首付款仅￥80.00', REST_PERIOD: '每2周支付'}}, 
			// {installmentRuleId: 21, desc: {REST_PAY: '尾款分3次(0服务费)￥80.00/次', DOWN_PAY: '首付款仅￥80.00', REST_PERIOD: '每月支付'}}];
			// this.payType = this.plans[0].installmentRuleId.toString();
			// this.merchantPaymentCode = '57E140859E5248A6BC90E37C6766AD83'
			// this.merchantPaymentCode = '5DEED5E0CF648C7366F26C08B6703AD7'

			// 区分入口
			storage.set(WHERE_FROM, FROM_ONLINE);
			if (this.merchantPaymentCode) {
				storage.set(MERCHANT_PAYMENT_CODE, this.merchantPaymentCode);
			} else {
				this.merchantPaymentCode = storage.get(MERCHANT_PAYMENT_CODE);
			}
			this.queryMerchantGoodsInfo(comeinType);
		},
		
	}
</script>

<style lang="less" scoped>
view {
	box-sizing: border-box;
}
.discountRemindPop {
	.close {
		padding: 34rpx;
		text-align: right;
		view {
			width: 56rpx;
			display: inline-block;
		}
	}
	.remind {
		position: relative;
		width: 612rpx;
		height: 618rpx;
		image {
			width: 612rpx;
			height: 618rpx;
		}
		
		.content {
			position: absolute;
			left: 0;
			top: 0;
			padding: 0 30rpx;
		}

		.title {
			padding-top: 22rpx;
			text-align: center;
			font-size:38rpx;
			font-weight:600;
			color:rgba(255,255,255,1);
			line-height:54rpx;
		}
		
		.middle {
			margin: 70rpx auto 0;
			padding: 50rpx 20rpx 20rpx 40rpx;
			background:rgba(255,255,255,1);
			border-radius:12rpx;
			view {
				position: relative;
				margin-bottom: 20rpx;
				&:last-of-type {
					margin-bottom: 0;
				}
				text-align: left;
				font-size:24rpx;
				color:rgba(1,122,255,1);
				line-height:34rpx;
				
				&::before {
						content: '';
						position: absolute;
						left: -22rpx;
						top: 10rpx;
						width:14rpx;
						height:14rpx;
						border-radius: 100% 100%;
						background:rgba(1,122,255,.3);
				}
			}
		}
		
		.foot {
			padding-top: 46rpx;
			text-align: center;
			font-size:20rpx;
			color:rgba(255,255,255,0.3);
			line-height:28rpx;
		}
	}
}

.businessInfoW{
	position: relative;
	min-height: 100vh;
	background-color: #F2F2F2;

	// .businessInfo {
	// 	height: 250rpx;
	// 	padding: 30rpx;
	// 	background:linear-gradient(147deg,rgba(18,180,255,1) 0%,rgba(66,125,251,1) 100%);
	// 	box-shadow:0rpx 2rpx 8rpx 0rpx rgba(7,7,7,0.08);
	// 	border-radius:0rpx 0rpx 100rpx 0rpx;
			
	// 	.businessInfoLeft {
	// 		view:nth-of-type(1) {
	// 			font-size:36rpx;
	// 			font-weight:600;
	// 			color:rgba(255,255,255,1);
	// 			line-height:50rpx;
	// 		}
	// 		view:nth-of-type(2) {
	// 			margin-top: 18rpx;
				
	// 			font-size:24rpx;
	// 			color:rgba(255,255,255,0.8);
	// 			line-height:34rpx;
	// 		}
	// 		.ml18 {
	// 			margin-left: 18rpx;
	// 		}
	// 		.certification {
	// 			padding: 8rpx 20rpx;		
	// 			background:rgba(107,177,252,0.9);
	// 			border-radius:22rpx;
	// 			border:2rpx solid rgba(255,255,255,1);

	// 			font-size:20rpx;
	// 			color:rgba(255,255,255,1);
	// 			line-height:28rpx;
	// 		}
	// 	}
		
	// 	.businessInfoRight {
	// 		.headPic {
	// 			display: block;
	// 			width: 110rpx;
	// 			height: 110rpx;
	// 			border-radius: 100%;
	// 		}
	// 	}
	// }
	
	// .goodsInfo {
	// 	position: absolute;
	// 	left: 30rpx;
	// 	top: 180rpx;
	// 	right: 30rpx;
	// 	.goodsItem {
	// 		background:rgba(255,255,255,1);
	// 		box-shadow:0rpx 2rpx 10rpx 0rpx rgba(0,0,0,0.06);
	// 		border-radius:8rpx;
	// 	}
		
	// 	.money {
	// 		margin-bottom: 20rpx;
	// 		padding: 30rpx 24rpx;
	// 		font-size:36rpx;
	// 		font-weight:600;
	// 		color:rgba(63,63,63,1);
	// 		line-height:50rpx;
	// 	}
		
	// 	.detail {
	// 		display: flex;
	// 		height: 194rpx;
	// 		padding: 18rpx 20rpx;
	// 		.img {
	// 			width: 158rpx;
	// 			height: 158rpx;
	// 		}
	// 		.description {
	// 			flex: 1;
	// 			view:first-of-type {
	// 				height: 130rpx;
	// 				padding: 10rpx 26rpx;
	// 				font-size:26rpx;
	// 				color:rgba(63,63,63,1);
	// 				line-height:38rpx;
	// 			}
	// 			view:last-of-type {
	// 				padding: 0 16rpx 0 0;
	// 				font-size:20rpx;
	// 				color:rgba(1,122,255,1);
	// 				line-height:28rpx;
	// 				text-align: right;
	// 			}
	// 		}
	// 	}
	// }
		
	.types {
		padding: 300rpx 30rpx 0 30rpx;
		.title {
			display: flex;
			align-items: center;
			.left {
				font-size:30rpx;
				font-weight:500;
				color:rgba(63,63,63,1);
				line-height:42rpx;
			}
			.right {
				margin-left: 10rpx;
				width: 174rpx;
				height:40rpx;
				background:rgba(255,173,0,1);
				border-radius:20rpx;
				
				font-size:20rpx;
				font-weight:500;
				color:rgba(255,255,255,1);
				line-height:40rpx;
				text-align: center;
			}
		}

		.payTypeContainer {

			.discount {
				position: absolute;
				right: -40rpx;
				top: 10rpx;
				width:140rpx;
				height:30rpx;
				background:rgba(255,173,0,1);
				transform: rotate(45deg);

				padding: 4rpx 0;
				text-align: center;
				font-size:16rpx;
				font-weight:600;
				color:rgba(255,255,255,1);
				line-height:22rpx;
			}
			.item {
				display: flex;
				position: relative;
				overflow: hidden;
				height: 120rpx;
				margin-top: 20rpx;
				background:rgba(255,255,255,1);
				border-radius:8rpx;
				border:1rpx solid rgba(221,222,222,1);
				text-align: center;
				
				&.active {
					.payType {
						color:rgba(255,255,255,1);
						background-color: #006FE9;
					}
					.payTitle {
						color:rgba(1,122,255,1);
						background-color: #E8F4FF;
					}
					.payValue {
						color:rgba(1,122,255,1);
						background-color: #E8F4FF;
					}
				}
				
			}
			
			.left {
				width: 144rpx;
				padding: 40rpx 0;
				background:rgba(231,245,255,1);
				border-radius: 8rpx;
			}
			.middle {
				flex: 1;
				display: flex;
				flex-direction: column;
				view {
					flex: 1;
				}
			}
			.right {
				flex: 1;
				display: flex;
				flex-direction: column;
				view {
					flex: 1;
				}
			}
			
			.payType, .payValue {
				font-size:24rpx;
				font-weight:500;
				// color:rgba(32,160,255,1);
				color:rgba(109,114,120,1);
				line-height:40rpx;
			}
			
			.payTitle {
				padding-top: 20rpx;
				font-size:20rpx;
				color:rgba(109,114,120,1);
				line-height:40rpx;
			}
			.allPay {
				padding-top: 40rpx;
			}
		}
	}
	
	.agree {
		margin-top: 20rpx;
		padding: 0 30rpx;
		font-size:20rpx;
		color:rgba(63,63,63,1);
		line-height:28rpx;
		
		.important {
			color: #017AFF;
			text-decoration: underline;
		}
	}
	
	.btn {
		margin-top: 40rpx;
		padding: 0 30rpx;
		button {
			height:94rpx;
			border-radius:8rpx;
			background-color: #6D7278;
			color: white;
			&.active {
				background-color: #017AFF;
			}
		}
	}
}
	
// .goodsInfoPop{
// 	.noPic {
// 		width:612rpx;
// 		height:612rpx;
// 		background:rgba(232,244,255,1);
// 		border-radius:20rpx 20rpx 0rpx 0rpx;
// 		padding-top: 162rpx;
// 		text-align: center;
// 		image {
// 			width: 252rpx;
// 			height: 232rpx;
// 		}
// 	}
// 	.swiper {
// 		width: 612rpx;
// 		height: 612rpx;
// 		image {
// 			width: 100%;
// 			height: 100%;
// 		}
// 	}
// 	.swiperBottom {
// 		padding: 20rpx;
// 		background-color: rgba(255,255,255,1);
// 		border-radius: 0 0 20rpx 20rpx;
// 		.money {
// 			font-size:30rpx;
// 			font-weight:600;
// 			color:rgba(224,32,32,1);
// 			line-height:42rpx;
// 		}

// 		.goodsName {
// 			padding-top: 12rpx;
// 			font-size:26rpx;
// 			font-weight:600;
// 			color:rgba(63,63,63,1);
// 			line-height:38rpx;
// 		}

// 		.description {
// 			padding-top: 26rpx;
// 			font-size:26rpx;
// 			color:#595858;
// 			line-height:38rpx;
// 		}
// 	}
	// .close {
	// 	view {
	// 		width: 56rpx;
	// 		margin: 42rpx auto 0;
	// 	}
	// }
// }
</style>
