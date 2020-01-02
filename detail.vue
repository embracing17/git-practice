<template>
	<view :class="['orderDetail', {'ap-filter': !loaded}]">
    <down-pay v-if="showDownPay" :order="orderDetail"/>
    <tail-pay v-if="showTailPay" :order="orderDetail"/>
    <done v-if="showDone" :order="orderDetail"/>
	</view>
</template>

<script>
import DownPay from './components/downPay'
import TailPay from './components/tailPay'
import Done from './components/done'
import { ORDER_DETAIL } from '../../common'
import { wxPay } from  '../../common/wxFuns'

export default {
  components: {
    DownPay,
    TailPay,
    Done
  },
  data() {
    return {
      closePic: require('./imgs/closeBtn.png'),
      loaded: false,

      transStep: '', // 交易步骤
      transStatus: '', // 交易状态
      repayState: '', // 支付状态

      showDownPay: false,
      showTailPay: false,
      showDone: false,

      // 尾款信息
      orderDetail: {
        // orderId: '',
      }

    }
  },
  methods: {
    // onOverTime

    // 获取订单详情
    getDetail(id) {
      this.$http.get(`${ORDER_DETAIL}?orderId=${id}`).then(res => {
        const { transStep, transStatus, repayState } = res
        this.orderDetail = res
        // 待支付
        this.showDownPay = transStep === 'USER_CONFIRM' && transStatus === 'PROCESSING'
        // 商户待确认，待尾款
        this.showTailPay = transStep === 'MERCHANT_CONFIRM' && transStatus === 'PROCESSING' 
        || transStep === 'MERCHANT_CONFIRM' && transStatus === 'SUCCESS'
        || transStep === 'PLATFORM_SETTLE' && repayState !== 'DONE' //平台结算失败属于待尾款
        //失败，取消，超时，完成
        this.showDone = transStep !== 'PLATFORM_SETTLE' && transStatus === 'FAILED' //不包含平台结算失败，其他失败属于完成
        || transStatus === 'CANCEL' 
        || transStatus === 'TIMEOUT_FAILED' 
        || transStatus === 'BANNED'
        || transStep === 'PLATFORM_SETTLE' && repayState === 'DONE'
      }).finally(() => this.loaded = true)
    }
  },

  /**
   * 小程序生命周期
   */
  onLoad(opt) {
    console.log(opt)
    //mock
    // opt.id = 'O2389016304787914761'
    const { id } = opt
    if(id) {
      this.getDetail(id)
    }
    // uni.showLoading({mask: false})
    // setTimeout(() => {
    //   this.transStep = 'PLATFORM_SETTLE'
    //   this.downPay = {
    //     orderId: '123',
    //     sellerName: '夏侯渊',
    //     sellerUserName: '陈圆圆',
    //     goodsName: 'LV高级包包一个',
    //     totalAmount: 1000,
    //     createTime: '2019-11-09 15:20:00'
    //   }
    //   this.loaded = true
    //   uni.hideLoading()
    // }, 10000)
  }
}
</script>

<style lang="less">
// .orderDetail{
//   position: relative;

  /*.mask{*/
  /*  position: fixed;*/
  /*  top: 0;*/
  /*  left: 0;*/
  /*  width: 100%;*/
  /*  height: 100%;*/
  /*  z-index: 10;*/
  /*  filter: blur(100px);*/
  /*  background: #fff;*/
  /*  transform: scale(3);*/
  /*}*/
// }
</style>
